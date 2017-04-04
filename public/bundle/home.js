/*
GOAL: This module should mirror the NodeJS module system according the documented behavior.
The module transport will send down code that registers module definitions by an assigned path. In addition,
the module transport will send down code that registers additional metadata to allow the module resolver to
resolve modules in the browser. Additional metadata includes the following:

- "mains": The mapping of module directory paths to a fully resolved module path
- "remaps": The remapping of one fully resolved module path to another fully resolved module path (used for browser overrides)
- "run": A list of entry point modules that should be executed when ready

Inspired by:
https://github.com/joyent/node/blob/master/lib/module.js
*/
(function() {
    var win;

    if (typeof window !== 'undefined') {
        win = window;

        // This lasso modules client has already been loaded on the page. Do nothing;
        if (win.$_mod) {
            return;
        }

        win.global = win;
    }

    /** the module runtime */
    var $_mod;

    // this object stores the module factories with the keys being module paths and
    // values being a factory function or object (e.g. "/baz$3.0.0/lib/index" --> Function)
    var definitions = {};

    // Search path that will be checked when looking for modules
    var searchPaths = [];

    // The _ready flag is used to determine if "run" modules can
    // be executed or if they should be deferred until all dependencies
    // have been loaded
    var _ready = false;

    // If $_mod.run() is called when the page is not ready then
    // we queue up the run modules to be executed later
    var runQueue = [];

    // this object stores the Module instance cache with the keys being paths of modules (e.g., "/foo$1.0.0/bar" --> Module)
    var instanceCache = {};

    // This object maps installed dependencies to specific versions
    //
    // For example:
    // {
    //   // The package "foo" with version 1.0.0 has an installed package named "bar" (foo/node_modules/bar") and
    //   // the version of "bar" is 3.0.0
    //   "/foo$1.0.0/bar": "3.0.0"
    // }
    var installed = {};

    // Maps builtin modules such as "path", "buffer" to their fully resolved paths
    var builtins = {};

    // this object maps a directory to the fully resolved module path
    //
    // For example:
    //
    var mains = {};

    // used to remap a one fully resolved module path to another fully resolved module path
    var remapped = {};

    var cacheByDirname = {};

    // When a module is mapped to a global varialble we add a reference
    // that maps the path of the module to the loaded global instance.
    // We use this mapping to ensure that global modules are only loaded
    // once if they map to the same path.
    //
    // See issue #5 - Ensure modules mapped to globals only load once
    // https://github.com/raptorjs/raptor-modules/issues/5
    var loadedGlobalsByRealPath = {};

    function moduleNotFoundError(target, from) {
        var err = new Error('Cannot find module "' + target + '"' + (from ? ' from "' + from + '"' : ''));

        err.code = 'MODULE_NOT_FOUND';
        return err;
    }

    function Module(filename) {
       /*
        A Node module has these properties:
        - filename: The path of the module
        - id: The path of the module (same as filename)
        - exports: The exports provided during load
        - loaded: Has module been fully loaded (set to false until factory function returns)

        NOT SUPPORTED:
        - parent: parent Module
        - paths: The search path used by this module (NOTE: not documented in Node.js module system so we don't need support)
        - children: The modules that were required by this module
        */
        this.id = this.filename = filename;
        this.loaded = false;
        this.exports = undefined;
    }

    Module.cache = instanceCache;

    // temporary variable for referencing the Module prototype
    var Module_prototype = Module.prototype;

    Module_prototype.load = function(factoryOrObject) {
        var filename = this.id;

        if (factoryOrObject && factoryOrObject.constructor === Function) {
            // factoryOrObject is definitely a function
            var lastSlashPos = filename.lastIndexOf('/');

            // find the value for the __dirname parameter to factory
            var dirname = filename.substring(0, lastSlashPos);

            // local cache for requires initiated from this module/dirname
            var localCache = cacheByDirname[dirname] || (cacheByDirname[dirname] = {});

            // this is the require used by the module
            var instanceRequire = function(target) {
                // Only store the `module` in the local cache since `module.exports` may not be accurate
                // if there was a circular dependency
                var module = localCache[target] || (localCache[target] = requireModule(target, dirname));
                return module.exports;
            };

            // The require method should have a resolve method that will return the resolved
            // path but not actually instantiate the module.
            // This resolve function will make sure a definition exists for the corresponding
            // path of the target but it will not instantiate a new instance of the target.
            instanceRequire.resolve = function(target) {
                if (!target) {
                    throw moduleNotFoundError('');
                }

                var resolved = resolve(target, dirname);

                if (!resolved) {
                    throw moduleNotFoundError(target, dirname);
                }

                // NOTE: resolved[0] is the path and resolved[1] is the module factory
                return resolved[0];
            };

            // NodeJS provides access to the cache as a property of the "require" function
            instanceRequire.cache = instanceCache;

            // Expose the module system runtime via the `runtime` property
            // TODO: We should deprecate this in favor of `Module.prototype.__runtime`
            // @deprecated
            instanceRequire.runtime = $_mod;

            // $_mod.def("/foo$1.0.0/lib/index", function(require, exports, module, __filename, __dirname) {
            this.exports = {};

            // call the factory function
            factoryOrObject.call(this, instanceRequire, this.exports, this, filename, dirname);
        } else {
            // factoryOrObject is not a function so have exports reference factoryOrObject
            this.exports = factoryOrObject;
        }

        this.loaded = true;
    };

    /**
     * Defines a packages whose metadata is used by raptor-loader to load the package.
     */
    function define(path, factoryOrObject, options) {
        /*
        $_mod.def('/baz$3.0.0/lib/index', function(require, exports, module, __filename, __dirname) {
            // module source code goes here
        });
        */

        var globals = options && options.globals;

        definitions[path] = factoryOrObject;

        if (globals) {
            var target = win || global;
            for (var i=0;i<globals.length; i++) {
                var globalVarName = globals[i];
                var globalModule = loadedGlobalsByRealPath[path] = requireModule(path);
                target[globalVarName] = globalModule.exports;
            }
        }
    }

    function registerMain(path, relativePath) {
        mains[path] = relativePath;
    }

    function remap(fromPath, toPath) {
        remapped[fromPath] = toPath;
    }

    function builtin(name, target) {
        builtins[name] = target;
    }

    function registerInstalledDependency(parentPath, packageName, packageVersion) {
        // Example:
        // dependencies['/my-package$1.0.0/$/my-installed-package'] = '2.0.0'
        installed[parentPath + '/' + packageName] =  packageVersion;
    }

    /**
     * This function will take an array of path parts and normalize them by handling handle ".." and "."
     * and then joining the resultant string.
     *
     * @param {Array} parts an array of parts that presumedly was split on the "/" character.
     */
    function normalizePathParts(parts) {

        // IMPORTANT: It is assumed that parts[0] === "" because this method is used to
        // join an absolute path to a relative path
        var i;
        var len = 0;

        var numParts = parts.length;

        for (i = 0; i < numParts; i++) {
            var part = parts[i];

            if (part === '.') {
                // ignore parts with just "."
                /*
                // if the "." is at end of parts (e.g. ["a", "b", "."]) then trim it off
                if (i === numParts - 1) {
                    //len--;
                }
                */
            } else if (part === '..') {
                // overwrite the previous item by decrementing length
                len--;
            } else {
                // add this part to result and increment length
                parts[len] = part;
                len++;
            }
        }

        if (len === 1) {
            // if we end up with just one part that is empty string
            // (which can happen if input is ["", "."]) then return
            // string with just the leading slash
            return '/';
        } else if (len > 2) {
            // parts i s
            // ["", "a", ""]
            // ["", "a", "b", ""]
            if (parts[len - 1].length === 0) {
                // last part is an empty string which would result in trailing slash
                len--;
            }
        }

        // truncate parts to remove unused
        parts.length = len;
        return parts.join('/');
    }

    function join(from, target) {
        var targetParts = target.split('/');
        var fromParts = from == '/' ? [''] : from.split('/');
        return normalizePathParts(fromParts.concat(targetParts));
    }

    function withoutExtension(path) {
        var lastDotPos = path.lastIndexOf('.');
        var lastSlashPos;

        /* jshint laxbreak:true */
        return ((lastDotPos === -1) || ((lastSlashPos = path.lastIndexOf('/')) !== -1) && (lastSlashPos > lastDotPos))
            ? null // use null to indicate that returned path is same as given path
            : path.substring(0, lastDotPos);
    }

    function splitPackageIdAndSubpath(path) {
        path = path.substring(1); /* Skip past the first slash */
        // Examples:
        //     '/my-package$1.0.0/foo/bar' --> ['my-package$1.0.0', '/foo/bar']
        //     '/my-package$1.0.0' --> ['my-package$1.0.0', '']
        //     '/my-package$1.0.0/' --> ['my-package$1.0.0', '/']
        //     '/@my-scoped-package/foo/$1.0.0/' --> ['@my-scoped-package/foo$1.0.0', '/']
        var slashPos = path.indexOf('/');

        if (path.charAt(1) === '@') {
            // path is something like "/@my-user-name/my-scoped-package/subpath"
            // For scoped packages, the package name is two parts. We need to skip
            // past the second slash to get the full package name
            slashPos = path.indexOf('/', slashPos+1);
        }

        var packageIdEnd = slashPos === -1 ? path.length : slashPos;

        return [
            path.substring(0, packageIdEnd), // Everything up to the slash
            path.substring(packageIdEnd) // Everything after the package ID
        ];
    }

    function resolveInstalledModule(target, from) {
        // Examples:
        // target='foo', from='/my-package$1.0.0/hello/world'

        if (target.charAt(target.length-1) === '/') {
            // This is a hack because I found require('util/') in the wild and
            // it did not work because of the trailing slash
            target = target.slice(0, -1);
        }

        // Check to see if the target module is a builtin module.
        // For example:
        // builtins['path'] = '/path-browserify$0.0.0/index'
        var builtinPath = builtins[target];
        if (builtinPath) {
            return builtinPath;
        }

        var fromParts = splitPackageIdAndSubpath(from);
        var fromPackageId = fromParts[0];


        var targetSlashPos = target.indexOf('/');
        var targetPackageName;
        var targetSubpath;

        if (targetSlashPos < 0) {
            targetPackageName = target;
            targetSubpath = '';
        } else {

            if (target.charAt(0) === '@') {
                // target is something like "@my-user-name/my-scoped-package/subpath"
                // For scoped packages, the package name is two parts. We need to skip
                // past the first slash to get the full package name
                targetSlashPos = target.indexOf('/', targetSlashPos + 1);
            }

            targetPackageName = target.substring(0, targetSlashPos);
            targetSubpath = target.substring(targetSlashPos);
        }

        var targetPackageVersion = installed[fromPackageId + '/' + targetPackageName];
        if (targetPackageVersion) {
            var resolvedPath = '/' + targetPackageName + '$' + targetPackageVersion;
            if (targetSubpath) {
                resolvedPath += targetSubpath;
            }
            return resolvedPath;
        }
    }

    function resolve(target, from) {
        var resolvedPath;

        if (target.charAt(0) === '.') {
            // turn relative path into absolute path
            resolvedPath = join(from, target);
        } else if (target.charAt(0) === '/') {
            // handle targets such as "/my/file" or "/$/foo/$/baz"
            resolvedPath = normalizePathParts(target.split('/'));
        } else {
            var len = searchPaths.length;
            for (var i = 0; i < len; i++) {
                // search path entries always end in "/";
                var candidate = searchPaths[i] + target;
                var resolved = resolve(candidate, from);
                if (resolved) {
                    return resolved;
                }
            }

            resolvedPath = resolveInstalledModule(target, from);
        }

        if (!resolvedPath) {
            return undefined;
        }

        // target is something like "/foo/baz"
        // There is no installed module in the path
        var relativePath;

        // check to see if "target" is a "directory" which has a registered main file
        if ((relativePath = mains[resolvedPath]) !== undefined) {
            if (!relativePath) {
                relativePath = 'index';
            }

            // there is a main file corresponding to the given target so add the relative path
            resolvedPath = join(resolvedPath, relativePath);
        }

        var remappedPath = remapped[resolvedPath];
        if (remappedPath) {
            resolvedPath = remappedPath;
        }

        var factoryOrObject = definitions[resolvedPath];
        if (factoryOrObject === undefined) {
            // check for definition for given path but without extension
            var resolvedPathWithoutExtension;
            if (((resolvedPathWithoutExtension = withoutExtension(resolvedPath)) === null) ||
                ((factoryOrObject = definitions[resolvedPathWithoutExtension]) === undefined)) {
                return undefined;
            }

            // we found the definition based on the path without extension so
            // update the path
            resolvedPath = resolvedPathWithoutExtension;
        }

        return [resolvedPath, factoryOrObject];
    }

    function requireModule(target, from) {
        if (!target) {
            throw moduleNotFoundError('');
        }

        var resolved = resolve(target, from);
        if (!resolved) {
            throw moduleNotFoundError(target, from);
        }

        var resolvedPath = resolved[0];

        var module = instanceCache[resolvedPath];

        if (module !== undefined) {
            // found cached entry based on the path
            return module;
        }

        // Fixes issue #5 - Ensure modules mapped to globals only load once
        // https://github.com/raptorjs/raptor-modules/issues/5
        //
        // If a module is mapped to a global variable then we want to always
        // return that global instance of the module when it is being required
        // to avoid duplicate modules being loaded. For modules that are mapped
        // to global variables we also add an entry that maps the path
        // of the module to the global instance of the loaded module.

        if (loadedGlobalsByRealPath.hasOwnProperty(resolvedPath)) {
            return loadedGlobalsByRealPath[resolvedPath];
        }

        var factoryOrObject = resolved[1];

        module = new Module(resolvedPath);

        // cache the instance before loading (allows support for circular dependency with partial loading)
        instanceCache[resolvedPath] = module;

        module.load(factoryOrObject);

        return module;
    }

    function require(target, from) {
        var module = requireModule(target, from);
        return module.exports;
    }

    /*
    $_mod.run('/$/installed-module', '/src/foo');
    */
    function run(path, options) {
        var wait = !options || (options.wait !== false);
        if (wait && !_ready) {
            return runQueue.push([path, options]);
        }

        require(path, '/');
    }

    /*
     * Mark the page as being ready and execute any of the
     * run modules that were deferred
     */
    function ready() {
        _ready = true;

        var len;
        while((len = runQueue.length)) {
            // store a reference to the queue before we reset it
            var queue = runQueue;

            // clear out the queue
            runQueue = [];

            // run all of the current jobs
            for (var i = 0; i < len; i++) {
                var args = queue[i];
                run(args[0], args[1]);
            }

            // stop running jobs in the queue if we change to not ready
            if (!_ready) {
                break;
            }
        }
    }

    function addSearchPath(prefix) {
        searchPaths.push(prefix);
    }

    var pendingCount = 0;
    var onPendingComplete = function() {
        pendingCount--;
        if (!pendingCount) {
            // Trigger any "require-run" modules in the queue to run
            ready();
        }
    };

    /*
     * $_mod is the short-hand version that that the transport layer expects
     * to be in the browser window object
     */
    Module_prototype.__runtime = $_mod = {
        /**
         * Used to register a module factory/object (*internal*)
         */
        def: define,

        /**
         * Used to register an installed dependency (e.g. "/$/foo" depends on "baz") (*internal*)
         */
        installed: registerInstalledDependency,
        run: run,
        main: registerMain,
        remap: remap,
        builtin: builtin,
        require: require,
        resolve: resolve,
        join: join,
        ready: ready,

        /**
         * Add a search path entry (internal)
         */
        searchPath: addSearchPath,

        /**
         * Sets the loader metadata for this build.
         *
         * @param asyncPackageName {String} name of asynchronous package
         * @param contentType {String} content type ("js" or "css")
         * @param bundleUrl {String} URL of bundle that belongs to package
         */
        loaderMetadata: function(data) {
            // We store loader metadata in the prototype of Module
            // so that `lasso-loader` can read it from
            // `module.__loaderMetadata`.
            Module_prototype.__loaderMetadata = data;
        },

        /**
         * Asynchronous bundle loaders should call `pending()` to instantiate
         * a new job. The object we return here has a `done` method that
         * should be called when the job completes. When the number of
         * pending jobs drops to 0, we invoke any of the require-run modules
         * that have been declared.
         */
        pending: function() {
            _ready = false;
            pendingCount++;
            return {
                done: onPendingComplete
            };
        }
    };

    if (win) {
        win.$_mod = $_mod;
    } else {
        module.exports = $_mod;
    }
})();

$_mod.installed("behealth$0.0.1", "marko", "4.1.3");
$_mod.main("/marko$4.1.3/runtime/vdom", "");
$_mod.installed("marko$4.1.3", "events-light", "1.0.5");
$_mod.main("/events-light$1.0.5", "src/index");
$_mod.def("/events-light$1.0.5/src/index", function(require, exports, module, __filename, __dirname) { /* jshint newcap:false */
var slice = Array.prototype.slice;

function isFunction(arg) {
    return typeof arg === 'function';
}

function checkListener(listener) {
    if (!isFunction(listener)) {
        throw TypeError('Invalid listener');
    }
}

function invokeListener(ee, listener, args) {
    switch (args.length) {
        // fast cases
        case 1:
            listener.call(ee);
            break;
        case 2:
            listener.call(ee, args[1]);
            break;
        case 3:
            listener.call(ee, args[1], args[2]);
            break;
            // slower
        default:
            listener.apply(ee, slice.call(args, 1));
    }
}

function addListener(eventEmitter, type, listener, prepend) {
    checkListener(listener);

    var events = eventEmitter.$e || (eventEmitter.$e = {});

    var listeners = events[type];
    if (listeners) {
        if (isFunction(listeners)) {
            events[type] = prepend ? [listener, listeners] : [listeners, listener];
        } else {
            if (prepend) {
                listeners.unshift(listener);
            } else {
                listeners.push(listener);
            }
        }

    } else {
        events[type] = listener;
    }
    return eventEmitter;
}

function EventEmitter() {
    this.$e = this.$e || {};
}

EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype = {
    $e: null,

    emit: function(type) {
        var args = arguments;

        var events = this.$e;
        if (!events) {
            return;
        }

        var listeners = events && events[type];
        if (!listeners) {
            // If there is no 'error' event listener then throw.
            if (type === 'error') {
                var error = args[1];
                if (!(error instanceof Error)) {
                    var context = error;
                    error = new Error('Error: ' + context);
                    error.context = context;
                }

                throw error; // Unhandled 'error' event
            }

            return false;
        }

        if (isFunction(listeners)) {
            invokeListener(this, listeners, args);
        } else {
            listeners = slice.call(listeners);

            for (var i=0, len=listeners.length; i<len; i++) {
                var listener = listeners[i];
                invokeListener(this, listener, args);
            }
        }

        return true;
    },

    on: function(type, listener) {
        return addListener(this, type, listener, false);
    },

    prependListener: function(type, listener) {
        return addListener(this, type, listener, true);
    },

    once: function(type, listener) {
        checkListener(listener);

        function g() {
            this.removeListener(type, g);

            if (listener) {
                listener.apply(this, arguments);
                listener = null;
            }
        }

        this.on(type, g);

        return this;
    },

    // emits a 'removeListener' event iff the listener was removed
    removeListener: function(type, listener) {
        checkListener(listener);

        var events = this.$e;
        var listeners;

        if (events && (listeners = events[type])) {
            if (isFunction(listeners)) {
                if (listeners === listener) {
                    delete events[type];
                }
            } else {
                for (var i=listeners.length-1; i>=0; i--) {
                    if (listeners[i] === listener) {
                        listeners.splice(i, 1);
                    }
                }
            }
        }

        return this;
    },

    removeAllListeners: function(type) {
        var events = this.$e;
        if (events) {
            delete events[type];
        }
    },

    listenerCount: function(type) {
        var events = this.$e;
        var listeners = events && events[type];
        return listeners ? (isFunction(listeners) ? 1 : listeners.length) : 0;
    }
};

module.exports = EventEmitter;
});
$_mod.def("/marko$4.1.3/runtime/vdom/VNode", function(require, exports, module, __filename, __dirname) { /* jshint newcap:false */
function VNode() {}

VNode.prototype = {
    $__VNode: function(finalChildCount) {
        this.$__finalChildCount = finalChildCount;
        this.$__childCount = 0;
        this.$__firstChild = null;
        this.$__lastChild = null;
        this.$__parentNode = null;
        this.$__nextSibling = null;
    },

    get firstChild() {
        var firstChild = this.$__firstChild;

        if (firstChild && firstChild.$__DocumentFragment) {
            var nestedFirstChild = firstChild.firstChild;
            // The first child is a DocumentFragment node.
            // If the DocumentFragment node has a first child then we will return that.
            // Otherwise, the DocumentFragment node is not *really* the first child and
            // we need to skip to its next sibling
            return nestedFirstChild || firstChild.nextSibling;
        }

        return firstChild;
    },

    get nextSibling() {
        var nextSibling = this.$__nextSibling;

        if (nextSibling) {
            if (nextSibling.$__DocumentFragment) {
                var firstChild = nextSibling.firstChild;
                return firstChild || nextSibling.nextSibling;
            }
        } else {
            var parentNode = this.$__parentNode;
            if (parentNode && parentNode.$__DocumentFragment) {
                return parentNode.nextSibling;
            }
        }

        return nextSibling;
    },

    $__appendChild: function(child) {
        this.$__childCount++;

        if (this.$__isTextArea) {
            if (child.$__Text) {
                var childValue = child.nodeValue;
                this.$__value = (this.$__value || '') + childValue;
            } else {
                throw TypeError();
            }
        } else {
            var lastChild = this.$__lastChild;

            child.$__parentNode = this;

            if (lastChild) {
                lastChild.$__nextSibling = child;
            } else {
                this.$__firstChild = child;
            }

            this.$__lastChild = child;
        }

        return child;
    },

    $__finishChild: function finishChild() {
        if (this.$__childCount == this.$__finalChildCount && this.$__parentNode) {
            return this.$__parentNode.$__finishChild();
        } else {
            return this;
        }
    },

    actualize: function(doc) {
        var actualNode = this.$__actualize(doc);

        var curChild = this.firstChild;

        while(curChild) {
            actualNode.appendChild(curChild.actualize(doc));
            curChild = curChild.nextSibling;
        }

        return actualNode;
    }

    // ,toJSON: function() {
    //     var clone = Object.assign({
    //         nodeType: this.nodeType
    //     }, this);
    //
    //     for (var k in clone) {
    //         if (k.startsWith('_')) {
    //             delete clone[k];
    //         }
    //     }
    //     delete clone._nextSibling;
    //     delete clone._lastChild;
    //     delete clone.parentNode;
    //     return clone;
    // }
};

module.exports = VNode;

});
$_mod.installed("marko$4.1.3", "raptor-util", "3.2.0");
$_mod.def("/raptor-util$3.2.0/copyProps", function(require, exports, module, __filename, __dirname) { module.exports = function copyProps(from, to) {
    Object.getOwnPropertyNames(from).forEach(function(name) {
        var descriptor = Object.getOwnPropertyDescriptor(from, name);
        Object.defineProperty(to, name, descriptor);
    });
};
});
$_mod.def("/raptor-util$3.2.0/inherit", function(require, exports, module, __filename, __dirname) { var copyProps = require('/raptor-util$3.2.0/copyProps'/*'./copyProps'*/);

function inherit(ctor, superCtor, shouldCopyProps) {
    var oldProto = ctor.prototype;
    var newProto = ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
            value: ctor,
            writable: true,
            configurable: true
        }
    });
    if (oldProto && shouldCopyProps !== false) {
        copyProps(oldProto, newProto);
    }
    ctor.$super = superCtor;
    ctor.prototype = newProto;
    return ctor;
}


module.exports = inherit;
inherit._inherit = inherit;

});
$_mod.def("/marko$4.1.3/runtime/vdom/VComment", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.1.3/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.2.0/inherit'/*'raptor-util/inherit'*/);

function VComment(value) {
    this.$__VNode(-1 /* no children */);
    this.nodeValue = value;
}

VComment.prototype = {
    nodeType: 8,

    $__actualize: function(doc) {
        return doc.createComment(this.nodeValue);
    },

    $__cloneNode: function() {
        return new VComment(this.nodeValue);
    }
};

inherit(VComment, VNode);

module.exports = VComment;

});
$_mod.def("/raptor-util$3.2.0/extend", function(require, exports, module, __filename, __dirname) { module.exports = function extend(target, source) { //A simple function to copy properties from one object to another
    if (!target) { //Check if a target was provided, otherwise create a new empty object to return
        target = {};
    }

    if (source) {
        for (var propName in source) {
            if (source.hasOwnProperty(propName)) { //Only look at source properties that are not inherited
                target[propName] = source[propName]; //Copy the property
            }
        }
    }

    return target;
};
});
$_mod.def("/marko$4.1.3/runtime/vdom/VDocumentFragment", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.1.3/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.2.0/inherit'/*'raptor-util/inherit'*/);
var extend = require('/raptor-util$3.2.0/extend'/*'raptor-util/extend'*/);

function VDocumentFragmentClone(other) {
    extend(this, other);
    this.$__parentNode = null;
    this.$__nextSibling = null;
}

function VDocumentFragment(documentFragment) {
    this.$__VNode(null /* childCount */);
    this.namespaceURI = null;
}

VDocumentFragment.prototype = {
    nodeType: 11,

    $__DocumentFragment: true,

    $__cloneNode: function() {
        return new VDocumentFragmentClone(this);
    },

    $__actualize: function(doc) {
        return doc.createDocumentFragment();
    }
};

inherit(VDocumentFragment, VNode);

VDocumentFragmentClone.prototype = VDocumentFragment.prototype;

module.exports = VDocumentFragment;

});
$_mod.def("/marko$4.1.3/runtime/vdom/VElement", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.1.3/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.2.0/inherit'/*'raptor-util/inherit'*/);
var extend = require('/raptor-util$3.2.0/extend'/*'raptor-util/extend'*/);

var NS_XLINK = 'http://www.w3.org/1999/xlink';
var ATTR_XLINK_HREF = 'xlink:href';
var toString = String;

var FLAG_IS_SVG = 1;
var FLAG_IS_TEXTAREA = 2;
var FLAG_SIMPLE_ATTRS = 4;

var defineProperty = Object.defineProperty;


var ATTR_HREF = 'href';
var EMPTY_OBJECT = Object.freeze({});
var ATTR_MARKO_CONST = 'data-_mc';

var specialAttrRegexp = /^data-_/;


function convertAttrValue(type, value) {
    if (value === true) {
        return '';
    } else if (type == 'object') {
        return JSON.stringify(value);
    } else {
        return toString(value);
    }
}

function VElementClone(other) {
    extend(this, other);
    this.$__parentNode = null;
    this.$__nextSibling = null;
}

function VElement(tagName, attrs, childCount, flags, constId) {
    this.$__VNode(childCount);

    if (constId) {
        if (!attrs) {
            attrs = {};
        }
        attrs[ATTR_MARKO_CONST] = constId;
    }

    var namespaceURI;

    if ((this.$__flags = flags || 0)) {
        if (flags & FLAG_IS_SVG) {
            namespaceURI = 'http://www.w3.org/2000/svg';
        }
    }

    this.$__attributes = attrs || EMPTY_OBJECT;
    this.$__namespaceURI = namespaceURI;
    this.nodeName = tagName;
    this.$__value = null;
    this.$__constId = constId;
}

VElement.prototype = {
    $__VElement: true,

    nodeType: 1,

    $__cloneNode: function() {
        return new VElementClone(this);
    },

    /**
     * Shorthand method for creating and appending an HTML element
     *
     * @param  {String} tagName    The tag name (e.g. "div")
     * @param  {int|null} attrCount  The number of attributes (or `null` if not known)
     * @param  {int|null} childCount The number of child nodes (or `null` if not known)
     */
    e: function(tagName, attrs, childCount, flags, constId) {
        var child = this.$__appendChild(new VElement(tagName, attrs, childCount, flags, constId));

        if (childCount === 0) {
            return this.$__finishChild();
        } else {
            return child;
        }
    },



    /**
     * Shorthand method for creating and appending a static node. The provided node is automatically cloned
     * using a shallow clone since it will be mutated as a result of setting `nextSibling` and `parentNode`.
     *
     * @param  {String} value The value for the new Comment node
     */
    n: function(node) {
        this.$__appendChild(node.$__cloneNode());
        return this.$__finishChild();
    },

    $__actualize: function(doc) {
        var namespaceURI = this.$__namespaceURI;
        var tagName = this.nodeName;

        var el = namespaceURI ?
            doc.createElementNS(namespaceURI, tagName) :
            doc.createElement(tagName);


        var attributes = this.$__attributes;
        for (var attrName in attributes) {
            var attrValue = attributes[attrName];

            if (attrName[5] == '_' && specialAttrRegexp.test(attrName)) {
                continue;
            }

            if (attrValue !== false && attrValue != null) {
                var type = typeof attrValue;

                if (type != 'string') {
                    // Special attributes aren't copied to the real DOM. They are only
                    // kept in the virtual attributes map
                    attrValue = convertAttrValue(type, attrValue);
                }

                namespaceURI = null;

                if (attrName == ATTR_XLINK_HREF) {
                    namespaceURI = NS_XLINK;
                    attrName = ATTR_HREF;
                }

                el.setAttributeNS(namespaceURI, attrName, attrValue);
            }
        }

        var flags = this.$__flags;

        if (flags & FLAG_IS_TEXTAREA) {
            el.value = this.$__value;
        }

        el._vattrs = attributes;
        el._vflags = flags;

        return el;
    },

    $__hasAttribute: function(name) {
        // We don't care about the namespaces since the there
        // is no chance that attributes with the same name will have
        // different namespaces
        var value = this.$__attributes[name];
        return value != null && value !== false;
    },

    $__isSameNode: function(otherNode) {
        if (otherNode.nodeType == 1) {
            var constId = this.$__constId;
            if (constId) {
                var otherVirtualAttrs;

                var otherConstId = otherNode.$__VNode ?
                    otherNode.$__constId :
                    (otherVirtualAttrs = otherNode._vattrs) && otherVirtualAttrs[ATTR_MARKO_CONST];
                return constId === otherConstId;
            }
        }

        return false;
    }
};

inherit(VElement, VNode);

var proto = VElementClone.prototype = VElement.prototype;

['checked', 'selected', 'disabled'].forEach(function(name) {
    defineProperty(proto, name, {
        get: function () {
            var value = this.$__attributes[name];
            return value !== false && value != null;
        }
    });
});

defineProperty(proto, 'id', {
    get: function () {
        return this.$__attributes.id;
    }
});

defineProperty(proto, 'value', {
    get: function () {
        var value = this.$__value;
        if (value == null) {
            value = this.$__attributes.value;
        }
        return value != null ? toString(value) : '';
    }
});

defineProperty(proto, '$__isTextArea', {
    get: function () {
        return this.$__flags & FLAG_IS_TEXTAREA;
    }
});

VElement.$__removePreservedAttributes = function(attrs) {
    // By default this static method is a no-op, but if there are any
    // compiled components that have "no-update" attributes then
    // `preserve-attrs.js` will be imported and this method will be replaced
    // with a method that actually does something
    return attrs;
};

VElement.$__morphAttrs = function(fromEl, toEl) {

    var removePreservedAttributes = VElement.$__removePreservedAttributes;

    var attrs = toEl.$__attributes || toEl._vattrs;
    var attrName;
    var i;

    // We use expando properties to associate the previous HTML
    // attributes provided as part of the VDOM node with the
    // real VElement DOM node. When diffing attributes,
    // we only use our internal representation of the attributes.
    // When diffing for the first time it's possible that the
    // real VElement node will not have the expando property
    // so we build the attribute map from the expando property

    var oldAttrs = fromEl._vattrs;
    if (oldAttrs) {
        if (oldAttrs == attrs) {
            // For constant attributes the same object will be provided
            // every render and we can use that to our advantage to
            // not waste time diffing a constant, immutable attribute
            // map.
            return;
        } else {
            oldAttrs = removePreservedAttributes(oldAttrs, true);
        }
    } else {
        // We need to build the attribute map from the real attributes
        oldAttrs = {};

        var oldAttributesList = fromEl.attributes;
        for (i = oldAttributesList.length - 1; i >= 0; --i) {
            var attr = oldAttributesList[i];

            if (attr.specified !== false) {
                attrName = attr.name;
                var attrNamespaceURI = attr.namespaceURI;
                if (attrNamespaceURI === NS_XLINK) {
                    oldAttrs[ATTR_XLINK_HREF] = attr.value;
                } else {
                    oldAttrs[attrName] = attr.value;
                }
            }
        }

        // We don't want preserved attributes to show up in either the old
        // or new attribute map.
        removePreservedAttributes(oldAttrs, false);
    }

    fromEl._vattrs = attrs;

    var attrValue;

    var flags = toEl.$__flags;
    var oldFlags;

    if (flags & FLAG_SIMPLE_ATTRS && ((oldFlags = fromEl._vflags) & FLAG_SIMPLE_ATTRS)) {
        if (oldAttrs['class'] != (attrValue = attrs['class'])) {
            fromEl.className = attrValue;
        }
        if (oldAttrs.id != (attrValue = attrs.id)) {
            fromEl.id = attrValue;
        }
        if (oldAttrs.style != (attrValue = attrs.style)) {
            fromEl.style.cssText = attrValue;
        }
        return;
    }

    // In some cases we only want to set an attribute value for the first
    // render or we don't want certain attributes to be touched. To support
    // that use case we delete out all of the preserved attributes
    // so it's as if they never existed.
    attrs = removePreservedAttributes(attrs, true);

    var namespaceURI;

    // Loop over all of the attributes in the attribute map and compare
    // them to the value in the old map. However, if the value is
    // null/undefined/false then we want to remove the attribute
    for (attrName in attrs) {
        attrValue = attrs[attrName];
        namespaceURI = null;

        if (attrName == ATTR_XLINK_HREF) {
            namespaceURI = NS_XLINK;
            attrName = ATTR_HREF;
        }

        if (attrValue == null || attrValue === false) {
            fromEl.removeAttributeNS(namespaceURI, attrName);
        } else if (oldAttrs[attrName] !== attrValue) {

            if (attrName[5] == '_' && specialAttrRegexp.test(attrName)) {
                // Special attributes aren't copied to the real DOM. They are only
                // kept in the virtual attributes map
                continue;
            }

            var type = typeof attrValue;

            if (type != 'string') {
                attrValue = convertAttrValue(type, attrValue);
            }

            fromEl.setAttributeNS(namespaceURI, attrName, attrValue);
        }
    }

    // If there are any old attributes that are not in the new set of attributes
    // then we need to remove those attributes from the target node
    for (attrName in oldAttrs) {
        if (!(attrName in attrs)) {

            if (attrName == ATTR_XLINK_HREF) {
                namespaceURI = ATTR_XLINK_HREF;
                attrName = ATTR_HREF;
            }

            fromEl.removeAttributeNS(namespaceURI, attrName);
        }
    }
};

module.exports = VElement;

});
$_mod.def("/marko$4.1.3/runtime/vdom/VText", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.1.3/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.2.0/inherit'/*'raptor-util/inherit'*/);

function VText(value) {
    this.$__VNode(-1 /* no children */);
    this.nodeValue = value;
}

VText.prototype = {
    $__Text: true,

    nodeType: 3,

    $__actualize: function(doc) {
        return doc.createTextNode(this.nodeValue);
    },

    $__cloneNode: function() {
        return new VText(this.nodeValue);
    }
};

inherit(VText, VNode);

module.exports = VText;

});
$_mod.def("/marko$4.1.3/runtime/vdom/vdom", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.1.3/runtime/vdom/VNode'/*'./VNode'*/);
var VComment = require('/marko$4.1.3/runtime/vdom/VComment'/*'./VComment'*/);
var VDocumentFragment = require('/marko$4.1.3/runtime/vdom/VDocumentFragment'/*'./VDocumentFragment'*/);
var VElement = require('/marko$4.1.3/runtime/vdom/VElement'/*'./VElement'*/);
var VText = require('/marko$4.1.3/runtime/vdom/VText'/*'./VText'*/);
var FLAG_IS_TEXTAREA = 2;

var defaultDocument = typeof document != 'undefined' && document;

var FLAG_IS_TEXTAREA = 2;

var specialHtmlRegexp = /[&<]/;
var xmlnsRegExp = /^xmlns(:|$)/;

function virtualizeChildNodes(node, vdomParent) {
    var curChild = node.firstChild;
    while(curChild) {
        vdomParent.$__appendChild(virtualize(curChild));
        curChild = curChild.nextSibling;
    }
}

function virtualize(node) {
    switch(node.nodeType) {
        case 1:
            var attributes = node.attributes;
            var attrCount = attributes.length;

            var attrs;

            if (attrCount) {
                attrs = {};
                for (var i=0; i<attrCount; i++) {
                    var attr = attributes[i];
                    var attrName = attr.name;
                    if (!xmlnsRegExp.test(attrName)) {
                        attrs[attrName] = attr.value;
                    }
                }
            }

            var flags = 0;

            var tagName = node.nodeName;
            if (tagName === 'TEXTAREA') {
                flags |= FLAG_IS_TEXTAREA;
            }

            var vdomEl = new VElement(tagName, attrs, null, flags);
            vdomEl.$__namespaceURI = node.namespaceURI;

            if (vdomEl.$__isTextArea) {
                vdomEl.$__value = node.value;
            } else {
                virtualizeChildNodes(node, vdomEl);
            }

            return vdomEl;
        case 3:
            return new VText(node.nodeValue);
        case 8:
            return new VComment(node.nodeValue);
        case 11:
            var vdomDocFragment = new VDocumentFragment();
            virtualizeChildNodes(node, vdomDocFragment);
            return vdomDocFragment;
    }
}

function virtualizeHTML(html, doc) {
    if (!specialHtmlRegexp.test(html)) {
        return new VText(html);
    }

    var container = doc.createElement('body');
    container.innerHTML = html;
    var vdomFragment = new VDocumentFragment();

    var curChild = container.firstChild;
    while(curChild) {
        vdomFragment.$__appendChild(virtualize(curChild));
        curChild = curChild.nextSibling;
    }

    return vdomFragment;
}

var Node_prototype = VNode.prototype;

/**
 * Shorthand method for creating and appending a Text node with a given value
 * @param  {String} value The text value for the new Text node
 */
Node_prototype.t = function(value) {
    var type = typeof value;
    var vdomNode;

    if (type !== 'string') {
        if (value == null) {
            value = '';
        } else if (type === 'object') {
            if (value.toHTML) {
                vdomNode = virtualizeHTML(value.toHTML(), document);
            }
        }
    }

    this.$__appendChild(vdomNode || new VText(value.toString()));
    return this.$__finishChild();
};

/**
 * Shorthand method for creating and appending a Comment node with a given value
 * @param  {String} value The value for the new Comment node
 */
Node_prototype.c = function(value) {
    this.$__appendChild(new VComment(value));
    return this.$__finishChild();
};

Node_prototype.$__appendDocumentFragment = function() {
    return this.$__appendChild(new VDocumentFragment());
};

exports.$__VComment = VComment;
exports.$__VDocumentFragment = VDocumentFragment;
exports.$__VElement = VElement;
exports.$__VText = VText;
exports.$__virtualize = virtualize;
exports.$__virtualizeHTML = virtualizeHTML;
exports.$__defaultDocument = defaultDocument;

});
$_mod.remap("/marko$4.1.3/components/util", "/marko$4.1.3/components/util-browser");
$_mod.remap("/marko$4.1.3/components/init-components", "/marko$4.1.3/components/init-components-browser");
$_mod.installed("marko$4.1.3", "warp10", "1.3.4");
$_mod.def("/warp10$1.3.4/src/finalize", function(require, exports, module, __filename, __dirname) { var isArray = Array.isArray;

function resolve(object, path, len) {
    var current = object;
    for (var i=0; i<len; i++) {
        current = current[path[i]];
    }

    return current;
}

function resolveType(info) {
    if (info.type === 'Date') {
        return new Date(info.value);
    } else {
        throw new Error('Bad type');
    }
}

module.exports = function finalize(outer) {
    if (!outer) {
        return outer;
    }

    var assignments = outer.$$;
    if (assignments) {
        var object = outer.o;
        var len;

        if (assignments && (len=assignments.length)) {
            for (var i=0; i<len; i++) {
                var assignment = assignments[i];

                var rhs = assignment.r;
                var rhsValue;

                if (isArray(rhs)) {
                    rhsValue = resolve(object, rhs, rhs.length);
                } else {
                    rhsValue = resolveType(rhs);
                }

                var lhs = assignment.l;
                var lhsLast = lhs.length-1;

                if (lhsLast === -1) {
                    object = outer.o = rhsValue;
                    break;
                } else {
                    var lhsParent = resolve(object, lhs, lhsLast);
                    lhsParent[lhs[lhsLast]] = rhsValue;
                }
            }
        }

        assignments.length = 0; // Assignments have been applied, do not reapply

        return object == null ? null : object;
    } else {
        return outer;
    }

};
});
$_mod.def("/warp10$1.3.4/finalize", function(require, exports, module, __filename, __dirname) { module.exports = require('/warp10$1.3.4/src/finalize'/*'./src/finalize'*/);
});
$_mod.def("/marko$4.1.3/components/bubble", function(require, exports, module, __filename, __dirname) { module.exports = [
    /* Mouse Events */
    'click',
    'dblclick',
    'mousedown',
    'mouseup',
    // 'mouseover',
    // 'mousemove',
    // 'mouseout',
    'dragstart',
    'drag',
    // 'dragenter',
    // 'dragleave',
    // 'dragover',
    'drop',
    'dragend',

    /* Keyboard Events */
    'keydown',
    'keypress',
    'keyup',

    /* Form Events */
    'select',
    'change',
    'submit',
    'reset',
    'input',

    'attach', // Pseudo event supported by Marko
    'detach'  // Pseudo event supported by Marko

    // 'focus', <-- Does not bubble
    // 'blur', <-- Does not bubble
    // 'focusin', <-- Not supported in all browsers
    // 'focusout' <-- Not supported in all browsers
];
});
$_mod.def("/marko$4.1.3/components/event-delegation", function(require, exports, module, __filename, __dirname) { var componentsUtil = require('/marko$4.1.3/components/util-browser'/*'./util'*/);
var runtimeId = componentsUtil.$__runtimeId;
var componentLookup = componentsUtil.$__componentLookup;
var isArray = Array.isArray;

// We make our best effort to allow multiple marko runtimes to be loaded in the
// same window. Each marko runtime will get its own unique runtime ID.
var listenersAttachedKey = '$MED' + runtimeId;

function getEventAttribute(el, attrName) {
    var virtualAttrs = el._vattrs;

    if (virtualAttrs) {
        return virtualAttrs[attrName];
    } else {
        var attrValue = el.getAttribute(attrName);
        if (attrValue) {
            // <method_name> <component_id>[ <extra_args_index]
            var parts = attrValue.split(' ');
            if (parts.length == 3) {
                parts[2] = parseInt(parts[2], 10);
            }

            return parts;
        }
    }
}

function delegateEvent(node, target, event) {
    var targetMethod = target[0];
    var targetComponentId = target[1];
    var extraArgs = target[2];

    var targetComponent = componentLookup[targetComponentId];

    if (!targetComponent) {
        return;
    }

    var targetFunc = targetComponent[targetMethod];
    if (!targetFunc) {
        throw Error('Method not found: ' + targetMethod);
    }

    if (extraArgs != null) {
        if (typeof extraArgs === 'number') {
            extraArgs = targetComponent.$__bubblingDomEvents[extraArgs];
            if (!isArray(extraArgs)) {
                extraArgs = [extraArgs];
            }
        }
    }

    // Invoke the component method
    if (extraArgs) {
        targetFunc.apply(targetComponent, extraArgs.concat(event, node));
    } else {
        targetFunc.call(targetComponent, event, node);
    }
}

function attachBubbleEventListeners(doc) {
    var body = doc.body;
    // Here's where we handle event delegation using our own mechanism
    // for delegating events. For each event that we have white-listed
    // as supporting bubble, we will attach a listener to the root
    // document.body element. When we get notified of a triggered event,
    // we again walk up the tree starting at the target associated
    // with the event to find any mappings for event. Each mapping
    // is from a DOM event type to a method of a component.
    require('/marko$4.1.3/components/bubble'/*'./bubble'*/).forEach(function addBubbleHandler(eventType) {
        body.addEventListener(eventType, function(event) {
            var propagationStopped = false;

            // Monkey-patch to fix #97
            var oldStopPropagation = event.stopPropagation;

            event.stopPropagation = function() {
                oldStopPropagation.call(event);
                propagationStopped = true;
            };

            var curNode = event.target;
            if (!curNode) {
                return;
            }

            // Search up the tree looking DOM events mapped to target
            // component methods
            var attrName = 'data-_on' + eventType;
            var target;

            // Attributes will have the following form:
            // on<event_type>("<target_method>|<component_id>")

            do {
                if ((target = getEventAttribute(curNode, attrName))) {
                    delegateEvent(curNode, target, event);

                    if (propagationStopped) {
                        break;
                    }
                }
            } while((curNode = curNode.parentNode) && curNode.getAttribute);
        });
    });
}

function noop() {}

exports.$__handleNodeAttach = noop;
exports.$__handleNodeDetach = noop;
exports.$__delegateEvent = delegateEvent;
exports.$__getEventAttribute = getEventAttribute;

exports.$__init = function(doc) {
    if (!doc[listenersAttachedKey]) {
        doc[listenersAttachedKey] = true;
        attachBubbleEventListeners(doc);
    }
};
});
$_mod.def("/marko$4.1.3/runtime/events", function(require, exports, module, __filename, __dirname) { var EventEmitter = require('/events-light$1.0.5/src/index'/*'events-light'*/);
module.exports = new EventEmitter();
});
$_mod.def("/marko$4.1.3/components/nextRepeatedId", function(require, exports, module, __filename, __dirname) { var REPEATED_ID_KEY = '$rep';

module.exports = function nextRepeatedId(out, parentId, id) {
    var nextIdLookup = out.global[REPEATED_ID_KEY] || (out.global[REPEATED_ID_KEY] = {});

    var indexLookupKey = parentId + '-' + id;
    var currentIndex = nextIdLookup[indexLookupKey];
    if (currentIndex == null) {
        currentIndex = nextIdLookup[indexLookupKey] = 0;
    } else {
        currentIndex = ++nextIdLookup[indexLookupKey];
    }

    return indexLookupKey.slice(0, -2) + '[' + currentIndex + ']';
};

});
$_mod.remap("/marko$4.1.3/components/registry", "/marko$4.1.3/components/registry-browser");
$_mod.remap("/marko$4.1.3/components/loadComponent", "/marko$4.1.3/components/loadComponent-dynamic");
$_mod.def("/marko$4.1.3/components/loadComponent-dynamic", function(require, exports, module, __filename, __dirname) { 'use strict';

module.exports = function load(typeName) {
    // We make the assumption that the component type name is a path to a
    // fully resolved module path and that the module exists
    // as a CommonJS module
    return require(typeName);
};
});
$_mod.def("/marko$4.1.3/components/State", function(require, exports, module, __filename, __dirname) { var extend = require('/raptor-util$3.2.0/extend'/*'raptor-util/extend'*/);

function ensure(state, propertyName) {
    var proto = state.constructor.prototype;
    if (!(propertyName in proto)) {
        Object.defineProperty(proto, propertyName, {
            get: function() {
                return this.$__raw[propertyName];
            },
            set: function(value) {
                this.$__set(propertyName, value, false /* ensure:false */);
            }
        });
    }
}

function State(component, initialState) {
    this.$__component = component;
    this.$__raw = initialState || {};

    this.$__dirty = false;
    this.$__old = null;
    this.$__changes = null;
    this.$__forced = null; // An object that we use to keep tracking of state properties that were forced to be dirty

    if (initialState) {
        for(var key in initialState) {
            ensure(this, key);
        }
    }

    Object.seal(this);
}

State.prototype = {
    $__reset: function() {
        var self = this;

        self.$__dirty = false;
        self.$__old = null;
        self.$__changes = null;
        self.$__forced = null;
    },

    $__replace: function(newState) {
        var state = this;
        var key;

        var rawState = this.$__raw;

        for (key in rawState) {
            if (!(key in newState)) {
                state.$__set(key, undefined, false /* ensure:false */, false /* forceDirty:false */);
            }
        }

        for (key in newState) {
            state.$__set(key, newState[key], true /* ensure:true */, false /* forceDirty:false */);
        }
    },
    $__set: function(name, value, shouldEnsure, forceDirty) {
        var rawState = this.$__raw;

        if (shouldEnsure) {
            ensure(this, name);
        }

        if (forceDirty) {
            var forcedDirtyState = this.$__forced || (this.$__forced = {});
            forcedDirtyState[name] = true;
        } else if (rawState[name] === value) {
            return;
        }

        if (!this.$__dirty) {
            // This is the first time we are modifying the component state
            // so introduce some properties to do some tracking of
            // changes to the state
            this.$__dirty = true; // Mark the component state as dirty (i.e. modified)
            this.$__old = rawState;
            this.$__raw = rawState = extend({}, rawState);
            this.$__changes = {};
            this.$__component.$__queueUpdate();
        }

        this.$__changes[name] = value;

        if (value === undefined) {
            // Don't store state properties with an undefined or null value
            delete rawState[name];
        } else {
            // Otherwise, store the new value in the component state
            rawState[name] = value;
        }
    },
    toJSON: function() {
        return this.$__raw;
    }
};

module.exports = State;
});
$_mod.main("/marko$4.1.3", "runtime/index");
$_mod.remap("/marko$4.1.3/runtime/env-init", false);
$_mod.def("/marko$4.1.3/runtime/createOut", function(require, exports, module, __filename, __dirname) { var actualCreateOut;

function setCreateOut(createOutFunc) {
    actualCreateOut = createOutFunc;
}

function createOut(globalData) {
    return actualCreateOut(globalData);
}

createOut.$__setCreateOut = setCreateOut;

module.exports = createOut;
});
$_mod.main("/marko$4.1.3/runtime/loader", "");
$_mod.remap("/marko$4.1.3/runtime/loader/index", "/marko$4.1.3/runtime/loader/index-browser");
$_mod.remap("/marko$4.1.3/runtime/loader/index-browser", "/marko$4.1.3/runtime/loader/index-browser-dynamic");
$_mod.def("/marko$4.1.3/runtime/loader/index-browser-dynamic", function(require, exports, module, __filename, __dirname) { 'use strict';
module.exports = function load(templatePath) {
    // We make the assumption that the template path is a
    // fully resolved module path and that the module exists
    // as a CommonJS module
    return require(templatePath);
};
});
$_mod.def("/marko$4.1.3/runtime/index", function(require, exports, module, __filename, __dirname) { 'use strict';
({})/*require('./env-init')*/; // no-op in the browser, but enables extra features on the server

exports.createOut = require('/marko$4.1.3/runtime/createOut'/*'./createOut'*/);
exports.load = require('/marko$4.1.3/runtime/loader/index-browser-dynamic'/*'./loader'*/);
exports.events = require('/marko$4.1.3/runtime/events'/*'./events'*/);
});
$_mod.installed("marko$4.1.3", "listener-tracker", "2.0.0");
$_mod.main("/listener-tracker$2.0.0", "lib/listener-tracker");
$_mod.def("/listener-tracker$2.0.0/lib/listener-tracker", function(require, exports, module, __filename, __dirname) { var INDEX_EVENT = 0;
var INDEX_USER_LISTENER = 1;
var INDEX_WRAPPED_LISTENER = 2;
var DESTROY = "destroy";

function isNonEventEmitter(target) {
  return !target.once;
}

function EventEmitterWrapper(target) {
    this.$__target = target;
    this.$__listeners = [];
    this.$__subscribeTo = null;
}

EventEmitterWrapper.prototype = {
    $__remove: function(test, testWrapped) {
        var target = this.$__target;
        var listeners = this.$__listeners;

        this.$__listeners = listeners.filter(function(curListener) {
            var curEvent = curListener[INDEX_EVENT];
            var curListenerFunc = curListener[INDEX_USER_LISTENER];
            var curWrappedListenerFunc = curListener[INDEX_WRAPPED_LISTENER];

            if (testWrapped) {
                // If the user used `once` to attach an event listener then we had to
                // wrap their listener function with a new function that does some extra
                // cleanup to avoid a memory leak. If the `testWrapped` flag is set to true
                // then we are attempting to remove based on a function that we had to
                // wrap (not the user listener function)
                if (curWrappedListenerFunc && test(curEvent, curWrappedListenerFunc)) {
                    target.removeListener(curEvent, curWrappedListenerFunc);

                    return false;
                }
            } else if (test(curEvent, curListenerFunc)) {
                // If the listener function was wrapped due to it being a `once` listener
                // then we should remove from the target EventEmitter using wrapped
                // listener function. Otherwise, we remove the listener using the user-provided
                // listener function.
                target.removeListener(curEvent, curWrappedListenerFunc || curListenerFunc);

                return false;
            }

            return true;
        });

        // Fixes https://github.com/raptorjs/listener-tracker/issues/2
        // If all of the listeners stored with a wrapped EventEmitter
        // have been removed then we should unregister the wrapped
        // EventEmitter in the parent SubscriptionTracker
        var subscribeTo = this.$__subscribeTo;

        if (!this.$__listeners.length && subscribeTo) {
            var self = this;
            var subscribeToList = subscribeTo.$__subscribeToList;
            subscribeTo.$__subscribeToList = subscribeToList.filter(function(cur) {
                return cur !== self;
            });
        }
    },

    on: function(event, listener) {
        this.$__target.on(event, listener);
        this.$__listeners.push([event, listener]);
        return this;
    },

    once: function(event, listener) {
        var self = this;

        // Handling a `once` event listener is a little tricky since we need to also
        // do our own cleanup if the `once` event is emitted. Therefore, we need
        // to wrap the user's listener function with our own listener function.
        var wrappedListener = function() {
            self.$__remove(function(event, listenerFunc) {
                return wrappedListener === listenerFunc;
            }, true /* We are removing the wrapped listener */);

            listener.apply(this, arguments);
        };

        this.$__target.once(event, wrappedListener);
        this.$__listeners.push([event, listener, wrappedListener]);
        return this;
    },

    removeListener: function(event, listener) {
        if (typeof event === 'function') {
            listener = event;
            event = null;
        }

        if (listener && event) {
            this.$__remove(function(curEvent, curListener) {
                return event === curEvent && listener === curListener;
            });
        } else if (listener) {
            this.$__remove(function(curEvent, curListener) {
                return listener === curListener;
            });
        } else if (event) {
            this.removeAllListeners(event);
        }

        return this;
    },

    removeAllListeners: function(event) {

        var listeners = this.$__listeners;
        var target = this.$__target;

        if (event) {
            this.$__remove(function(curEvent, curListener) {
                return event === curEvent;
            });
        } else {
            for (var i = listeners.length - 1; i >= 0; i--) {
                var cur = listeners[i];
                target.removeListener(cur[INDEX_EVENT], cur[INDEX_USER_LISTENER]);
            }
            this.$__listeners.length = 0;
        }

        return this;
    }
};

function EventEmitterAdapter(target) {
    this.$__target = target;
}

EventEmitterAdapter.prototype = {
    on: function(event, listener) {
        this.$__target.addEventListener(event, listener);
        return this;
    },

    once: function(event, listener) {
        var self = this;

        // need to save this so we can remove it below
        var onceListener = function() {
          self.$__target.removeEventListener(event, onceListener);
          listener();
        };
        this.$__target.addEventListener(event, onceListener);
        return this;
    },

    removeListener: function(event, listener) {
        this.$__target.removeEventListener(event, listener);
        return this;
    }
};

function SubscriptionTracker() {
    this.$__subscribeToList = [];
}

SubscriptionTracker.prototype = {

    subscribeTo: function(target, options) {
        var addDestroyListener = !options || options.addDestroyListener !== false;
        var wrapper;
        var nonEE;
        var subscribeToList = this.$__subscribeToList;

        for (var i=0, len=subscribeToList.length; i<len; i++) {
            var cur = subscribeToList[i];
            if (cur.$__target === target) {
                wrapper = cur;
                break;
            }
        }

        if (!wrapper) {
            if (isNonEventEmitter(target)) {
              nonEE = new EventEmitterAdapter(target);
            }

            wrapper = new EventEmitterWrapper(nonEE || target);
            if (addDestroyListener && !nonEE) {
                wrapper.once(DESTROY, function() {
                    wrapper.removeAllListeners();

                    for (var i = subscribeToList.length - 1; i >= 0; i--) {
                        if (subscribeToList[i].$__target === target) {
                            subscribeToList.splice(i, 1);
                            break;
                        }
                    }
                });
            }

            // Store a reference to the parent SubscriptionTracker so that we can do cleanup
            // if the EventEmitterWrapper instance becomes empty (i.e., no active listeners)
            wrapper.$__subscribeTo = this;
            subscribeToList.push(wrapper);
        }

        return wrapper;
    },

    removeAllListeners: function(target, event) {
        var subscribeToList = this.$__subscribeToList;
        var i;

        if (target) {
            for (i = subscribeToList.length - 1; i >= 0; i--) {
                var cur = subscribeToList[i];
                if (cur.$__target === target) {
                    cur.removeAllListeners(event);

                    if (!cur.$__listeners.length) {
                        // Do some cleanup if we removed all
                        // listeners for the target event emitter
                        subscribeToList.splice(i, 1);
                    }

                    break;
                }
            }
        } else {
            for (i = subscribeToList.length - 1; i >= 0; i--) {
                subscribeToList[i].removeAllListeners();
            }
            subscribeToList.length = 0;
        }
    }
};

exports = module.exports = SubscriptionTracker;

exports.wrap = function(targetEventEmitter) {
    var nonEE;
    var wrapper;

    if (isNonEventEmitter(targetEventEmitter)) {
      nonEE = new EventEmitterAdapter(targetEventEmitter);
    }

    wrapper = new EventEmitterWrapper(nonEE || targetEventEmitter);
    if (!nonEE) {
      // we don't set this for non EE types
      targetEventEmitter.once(DESTROY, function() {
          wrapper.$__listeners.length = 0;
      });
    }

    return wrapper;
};

exports.createTracker = function() {
    return new SubscriptionTracker();
};

});
$_mod.def("/marko$4.1.3/components/update-manager", function(require, exports, module, __filename, __dirname) { 'use strict';

var updatesScheduled = false;
var batchStack = []; // A stack of batched updates
var unbatchedQueue = []; // Used for scheduled batched updates

var win = window;
var setImmediate = win.setImmediate;

if (!setImmediate) {
    if (win.postMessage) {
        var queue = [];
        var messageName = 'si';
        win.addEventListener('message', function (event) {
            var source = event.source;
            if (source == win || !source && event.data === messageName) {
                event.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        setImmediate = function(fn) {
            queue.push(fn);
            win.postMessage(messageName, '*');
        };
    } else {
        setImmediate = setTimeout;
    }
}

/**
 * This function is called when we schedule the update of "unbatched"
 * updates to components.
 */
function updateUnbatchedComponents() {
    if (unbatchedQueue.length) {
        try {
            updateComponents(unbatchedQueue);
        } finally {
            // Reset the flag now that this scheduled batch update
            // is complete so that we can later schedule another
            // batched update if needed
            updatesScheduled = false;
        }
    }
}

function scheduleUpdates() {
    if (updatesScheduled) {
        // We have already scheduled a batched update for the
        // process.nextTick so nothing to do
        return;
    }

    updatesScheduled = true;

    setImmediate(updateUnbatchedComponents);
}

function updateComponents(queue) {
    // Loop over the components in the queue and update them.
    // NOTE: It is okay if the queue grows during the iteration
    //       since we will still get to them at the end
    for (var i=0; i<queue.length; i++) {
        var component = queue[i];
        component.$__update(); // Do the actual component update
    }

    // Clear out the queue by setting the length to zero
    queue.length = 0;
}

function batchUpdate(func) {
    // If the batched update stack is empty then this
    // is the outer batched update. After the outer
    // batched update completes we invoke the "afterUpdate"
    // event listeners.
    var batch = {
        $__queue: null
    };

    batchStack.push(batch);

    try {
        func();
    } finally {
        try {
            // Update all of the components that where queued up
            // in this batch (if any)
            if (batch.$__queue) {
                updateComponents(batch.$__queue);
            }
        } finally {
            // Now that we have completed the update of all the components
            // in this batch we need to remove it off the top of the stack
            batchStack.length--;
        }
    }
}

function queueComponentUpdate(component) {
    var batchStackLen = batchStack.length;

    if (batchStackLen) {
        // When a batch update is started we push a new batch on to a stack.
        // If the stack has a non-zero length then we know that a batch has
        // been started so we can just queue the component on the top batch. When
        // the batch is ended this component will be updated.
        var batch = batchStack[batchStackLen-1];

        // We default the batch queue to null to avoid creating an Array instance
        // unnecessarily. If it is null then we create a new Array, otherwise
        // we push it onto the existing Array queue
        if (batch.$__queue) {
            batch.$__queue.push(component);
        } else {
            batch.$__queue = [component];
        }
    } else {
        // We are not within a batched update. We need to schedule a batch update
        // for the process.nextTick (if that hasn't been done already) and we will
        // add the component to the unbatched queued
        scheduleUpdates();
        unbatchedQueue.push(component);
    }
}

exports.$__queueComponentUpdate = queueComponentUpdate;
exports.$__batchUpdate = batchUpdate;
});
$_mod.main("/marko$4.1.3/morphdom", "");
$_mod.def("/marko$4.1.3/morphdom/specialElHandlers", function(require, exports, module, __filename, __dirname) { function syncBooleanAttrProp(fromEl, toEl, name) {
    if (fromEl[name] !== toEl[name]) {
        fromEl[name] = toEl[name];
        if (fromEl[name]) {
            fromEl.setAttribute(name, '');
        } else {
            fromEl.removeAttribute(name, '');
        }
    }
}

module.exports = {
    /**
     * Needed for IE. Apparently IE doesn't think that "selected" is an
     * attribute when reading over the attributes using selectEl.attributes
     */
    OPTION: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'selected');
    },
    /**
     * The "value" attribute is special for the <input> element since it sets
     * the initial value. Changing the "value" attribute without changing the
     * "value" property will have no effect since it is only used to the set the
     * initial value.  Similar for the "checked" attribute, and "disabled".
     */
    INPUT: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'checked');
        syncBooleanAttrProp(fromEl, toEl, 'disabled');

        if (fromEl.value != toEl.value) {
            fromEl.value = toEl.value;
        }

        if (!toEl.$__hasAttribute('value')) {
            fromEl.removeAttribute('value');
        }
    },

    TEXTAREA: function(fromEl, toEl) {
        var newValue = toEl.value;
        if (fromEl.value != newValue) {
            fromEl.value = newValue;
        }

        var firstChild = fromEl.firstChild;
        if (firstChild) {
            // Needed for IE. Apparently IE sets the placeholder as the
            // node value and vise versa. This ignores an empty update.
            var oldValue = firstChild.nodeValue;

            if (oldValue == newValue || (!newValue && oldValue == fromEl.placeholder)) {
                return;
            }

            firstChild.nodeValue = newValue;
        }
    },
    SELECT: function(fromEl, toEl) {
        if (!toEl.$__hasAttribute('multiple')) {
            var selectedIndex = -1;
            var i = 0;
            var curChild = toEl.firstChild;
            while(curChild) {
                if (curChild.nodeName == 'OPTION') {
                    if (curChild.$__hasAttribute('selected')) {
                        selectedIndex = i;
                        break;
                    }
                    i++;
                }
                curChild = curChild.nextSibling;
            }

            fromEl.selectedIndex = i;
        }
    }
};

});
$_mod.def("/marko$4.1.3/morphdom/index", function(require, exports, module, __filename, __dirname) { 'use strict';
var defaultDoc = typeof document == 'undefined' ? undefined : document;
var specialElHandlers = require('/marko$4.1.3/morphdom/specialElHandlers'/*'./specialElHandlers'*/);

var morphAttrs = require('/marko$4.1.3/runtime/vdom/VElement'/*'../runtime/vdom/VElement'*/).$__morphAttrs;

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

/**
 * Returns true if two node's names are the same.
 *
 * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
 *       nodeName and different namespace URIs.
 *
 * @param {Element} a
 * @param {Element} b The target element
 * @return {boolean}
 */
function compareNodeNames(fromEl, toEl) {
    return fromEl.nodeName == toEl.nodeName;
}

function replaceChild(child, newChild) {
    if (child.parentNode) {
        child.parentNode.replaceChild(newChild, child);
    }
    return newChild;
}

function morphdom(
        fromNode,
        toNode,
        context,
        onNodeAdded,
        onBeforeElUpdated,
        onBeforeNodeDiscarded,
        onNodeDiscarded,
        onBeforeElChildrenUpdated
    ) {

    var doc = fromNode.ownerDocument || defaultDoc;

    // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.
    var fromNodesLookup = {};
    var keyedRemovalList;

    function addKeyedRemoval(key) {
        if (keyedRemovalList) {
            keyedRemovalList.push(key);
        } else {
            keyedRemovalList = [key];
        }
    }

    function walkDiscardedChildNodes(node, skipKeyedNodes) {
        if (node.nodeType == ELEMENT_NODE) {
            var curChild = node.firstChild;
            while (curChild) {
                var key;

                if (skipKeyedNodes && (key = curChild.id)) {
                    // If we are skipping keyed nodes then we add the key
                    // to a list so that it can be handled at the very end.
                    addKeyedRemoval(key);
                } else {
                    // Only report the node as discarded if it is not keyed. We do this because
                    // at the end we loop through all keyed elements that were unmatched
                    // and then discard them in one final pass.
                    onNodeDiscarded(curChild);
                    if (curChild.firstChild) {
                        walkDiscardedChildNodes(curChild, skipKeyedNodes);
                    }
                }

                curChild = curChild.nextSibling;
            }
        }
    }

    /**
     * Removes a DOM node out of the original DOM
     *
     * @param  {Node} node The node to remove
     * @param  {Node} parentNode The nodes parent
     * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
     * @return {undefined}
     */
    function removeNode(node, parentNode, skipKeyedNodes) {
        if (onBeforeNodeDiscarded(node) == false) {
            return;
        }

        if (parentNode) {
            parentNode.removeChild(node);
        }

        onNodeDiscarded(node);
        walkDiscardedChildNodes(node, skipKeyedNodes);
    }

    // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
    // function indexTree(root) {
    //     var treeWalker = document.createTreeWalker(
    //         root,
    //         NodeFilter.SHOW_ELEMENT);
    //
    //     var el;
    //     while((el = treeWalker.nextNode())) {
    //         var key = getNodeKey(el);
    //         if (key) {
    //             fromNodesLookup[key] = el;
    //         }
    //     }
    // }

    // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
    //
    // function indexTree(node) {
    //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
    //     var el;
    //     while((el = nodeIterator.nextNode())) {
    //         var key = getNodeKey(el);
    //         if (key) {
    //             fromNodesLookup[key] = el;
    //         }
    //     }
    // }

    function indexTree(node) {
        if (node.nodeType == ELEMENT_NODE) {
            var curChild = node.firstChild;
            while (curChild) {
                var key = curChild.id;
                if (key) {
                    fromNodesLookup[key] = curChild;
                }

                // Walk recursively
                indexTree(curChild);

                curChild = curChild.nextSibling;
            }
        }
    }

    indexTree(fromNode);

    function addVirtualNode(vEl, parentEl) {
        var realEl = vEl.$__actualize(doc);

        if (parentEl) {
            parentEl.appendChild(realEl);
        }

        onNodeAdded(realEl, context);

        var vCurChild = vEl.firstChild;
        while (vCurChild) {
            var realCurChild = null;

            var key = vCurChild.id;
            if (key) {
                var unmatchedFromEl = fromNodesLookup[key];
                if (unmatchedFromEl && compareNodeNames(vCurChild, unmatchedFromEl)) {
                    morphEl(unmatchedFromEl, vCurChild, false);
                    realEl.appendChild(realCurChild = unmatchedFromEl);
                }
            }

            if (!realCurChild) {
                addVirtualNode(vCurChild, realEl);
            }

            vCurChild = vCurChild.nextSibling;
        }

        return realEl;
    }

    function morphEl(fromEl, toEl, childrenOnly) {

        if (!childrenOnly) {
            var toElKey = toEl.id;


            if (toElKey) {
                // If an element with an ID is being morphed then it is will be in the final
                // DOM so clear it out of the saved elements collection
                delete fromNodesLookup[toElKey];
            }

            if (toNode.$__isSameNode(fromNode)) {
                return;
            }

            if (onBeforeElUpdated(fromEl, context)) {
                return;
            }

            morphAttrs(fromEl, toEl);
        }


        if (onBeforeElChildrenUpdated(fromEl, context)) {
            return;
        }

        if (fromEl.nodeName != 'TEXTAREA') {
            var curToNodeChild = toEl.firstChild;
            var curFromNodeChild = fromEl.firstChild;
            var curToNodeKey;
            var curFromNodeKey;

            var fromNextSibling;
            var toNextSibling;
            var matchingFromEl;

            outer: while (curToNodeChild) {
                toNextSibling = curToNodeChild.nextSibling;
                curToNodeKey = curToNodeChild.id;

                while (curFromNodeChild) {
                    fromNextSibling = curFromNodeChild.nextSibling;

                    if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                        curToNodeChild = toNextSibling;
                        curFromNodeChild = fromNextSibling;
                        continue outer;
                    }

                    curFromNodeKey = curFromNodeChild.id;

                    var curFromNodeType = curFromNodeChild.nodeType;

                    var isCompatible = undefined;

                    if (curFromNodeType == curToNodeChild.nodeType) {
                        if (curFromNodeType == ELEMENT_NODE) {
                            // Both nodes being compared are Element nodes

                            if (curToNodeKey) {
                                // The target node has a key so we want to match it up with the correct element
                                // in the original DOM tree
                                if (curToNodeKey != curFromNodeKey) {
                                    // The current element in the original DOM tree does not have a matching key so
                                    // let's check our lookup to see if there is a matching element in the original
                                    // DOM tree
                                    if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                        if (curFromNodeChild.nextSibling == matchingFromEl) {
                                            // Special case for single element removals. To avoid removing the original
                                            // DOM node out of the tree (since that can break CSS transitions, etc.),
                                            // we will instead discard the current node and wait until the next
                                            // iteration to properly match up the keyed target element with its matching
                                            // element in the original tree
                                            isCompatible = false;
                                        } else {
                                            // We found a matching keyed element somewhere in the original DOM tree.
                                            // Let's moving the original DOM node into the current position and morph
                                            // it.

                                            // NOTE: We use insertBefore instead of replaceChild because we want to go through
                                            // the `removeNode()` function for the node that is being discarded so that
                                            // all lifecycle hooks are correctly invoked
                                            fromEl.insertBefore(matchingFromEl, curFromNodeChild);

                                            fromNextSibling = curFromNodeChild.nextSibling;

                                            if (curFromNodeKey) {
                                                // Since the node is keyed it might be matched up later so we defer
                                                // the actual removal to later
                                                addKeyedRemoval(curFromNodeKey);
                                            } else {
                                                // NOTE: we skip nested keyed nodes from being removed since there is
                                                //       still a chance they will be matched up later
                                                removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                                            }

                                            curFromNodeChild = matchingFromEl;
                                        }
                                    } else {
                                        // The nodes are not compatible since the "to" node has a key and there
                                        // is no matching keyed node in the source tree
                                        isCompatible = false;
                                    }
                                }
                            } else if (curFromNodeKey) {
                                // The original has a key
                                isCompatible = false;
                            }

                            isCompatible = isCompatible != false && compareNodeNames(curFromNodeChild, curToNodeChild);
                            if (isCompatible) {
                                // We found compatible DOM elements so transform
                                // the current "from" node to match the current
                                // target DOM node.
                                morphEl(curFromNodeChild, curToNodeChild, false);
                            }

                        } else if (curFromNodeType == TEXT_NODE || curFromNodeType == COMMENT_NODE) {
                            // Both nodes being compared are Text or Comment nodes
                            isCompatible = true;
                            // Simply update nodeValue on the original node to
                            // change the text value
                            curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
                        }
                    }

                    if (isCompatible) {
                        // Advance both the "to" child and the "from" child since we found a match
                        curToNodeChild = toNextSibling;
                        curFromNodeChild = fromNextSibling;
                        continue outer;
                    }

                    // No compatible match so remove the old node from the DOM and continue trying to find a
                    // match in the original DOM. However, we only do this if the from node is not keyed
                    // since it is possible that a keyed node might match up with a node somewhere else in the
                    // target tree and we don't want to discard it just yet since it still might find a
                    // home in the final DOM tree. After everything is done we will remove any keyed nodes
                    // that didn't find a home
                    if (curFromNodeKey) {
                        // Since the node is keyed it might be matched up later so we defer
                        // the actual removal to later
                        addKeyedRemoval(curFromNodeKey);
                    } else {
                        // NOTE: we skip nested keyed nodes from being removed since there is
                        //       still a chance they will be matched up later
                        removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                    }

                    curFromNodeChild = fromNextSibling;
                }

                // If we got this far then we did not find a candidate match for
                // our "to node" and we exhausted all of the children "from"
                // nodes. Therefore, we will just append the current "to" node
                // to the end
                if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
                    fromEl.appendChild(matchingFromEl);
                    morphEl(matchingFromEl, curToNodeChild, false);
                } else {
                    addVirtualNode(curToNodeChild, fromEl);
                }

                curToNodeChild = toNextSibling;
                curFromNodeChild = fromNextSibling;
            }

            // We have processed all of the "to nodes". If curFromNodeChild is
            // non-null then we still have some from nodes left over that need
            // to be removed
            while (curFromNodeChild) {
                fromNextSibling = curFromNodeChild.nextSibling;
                if ((curFromNodeKey = curFromNodeChild.id)) {
                    // Since the node is keyed it might be matched up later so we defer
                    // the actual removal to later
                    addKeyedRemoval(curFromNodeKey);
                } else {
                    // NOTE: we skip nested keyed nodes from being removed since there is
                    //       still a chance they will be matched up later
                    removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                }
                curFromNodeChild = fromNextSibling;
            }
        }

        var specialElHandler = specialElHandlers[fromEl.nodeName];
        if (specialElHandler) {
            specialElHandler(fromEl, toEl);
        }
    } // END: morphEl(...)

    var morphedNode = fromNode;
    var fromNodeType = morphedNode.nodeType;
    var toNodeType = toNode.nodeType;
    var morphChildrenOnly = false;

    // Handle the case where we are given two DOM nodes that are not
    // compatible (e.g. <div> --> <span> or <div> --> TEXT)
    if (fromNodeType == ELEMENT_NODE) {
        if (toNodeType == ELEMENT_NODE) {
            if (!compareNodeNames(fromNode, toNode)) {
                morphedNode = toNode.$__actualize(doc);
                replaceChild(fromNode, morphedNode);
                morphChildrenOnly = true;
                onNodeDiscarded(fromNode);
                walkDiscardedChildNodes(fromNode, true);
            }
        } else {
            // Going from an element node to a text or comment node
            onNodeDiscarded(fromNode);
            walkDiscardedChildNodes(fromNode, false);
            morphedNode = toNode.$__actualize(doc);
            return replaceChild(fromNode, morphedNode);
        }
    } else if (fromNodeType == TEXT_NODE || fromNodeType == COMMENT_NODE) { // Text or comment node
        if (toNodeType == fromNodeType) {
            morphedNode.nodeValue = toNode.nodeValue;
            return morphedNode;
        } else {
            // Text node to something else
            onNodeDiscarded(fromNode);
            return replaceChild(fromNode, addVirtualNode(toNode));
        }
    }

    morphEl(morphedNode, toNode, morphChildrenOnly);

    // We now need to loop over any keyed nodes that might need to be
    // removed. We only do the removal if we know that the keyed node
    // never found a match. When a keyed node is matched up we remove
    // it out of fromNodesLookup and we use fromNodesLookup to determine
    // if a keyed node has been matched up or not
    if (keyedRemovalList) {
        keyedRemovalList.forEach(function(key) {
            var elToRemove = fromNodesLookup[key];
            if (elToRemove) {
                removeNode(elToRemove, elToRemove.parentNode, false);
            }
        });
    }

    return morphedNode;
}

module.exports = morphdom;

});
$_mod.def("/marko$4.1.3/components/Component", function(require, exports, module, __filename, __dirname) { 'use strict';
/* jshint newcap:false */

var domInsert = require('/marko$4.1.3/runtime/dom-insert'/*'../runtime/dom-insert'*/);
var marko = require('/marko$4.1.3/runtime/index'/*'../'*/);
var componentsUtil = require('/marko$4.1.3/components/util-browser'/*'./util'*/);
var componentLookup = componentsUtil.$__componentLookup;
var emitLifecycleEvent = componentsUtil.$__emitLifecycleEvent;
var destroyComponentForEl = componentsUtil.$__destroyComponentForEl;
var destroyElRecursive = componentsUtil.$__destroyElRecursive;
var getElementById = componentsUtil.$__getElementById;
var EventEmitter = require('/events-light$1.0.5/src/index'/*'events-light'*/);
var RenderResult = require('/marko$4.1.3/runtime/RenderResult'/*'../runtime/RenderResult'*/);
var SubscriptionTracker = require('/listener-tracker$2.0.0/lib/listener-tracker'/*'listener-tracker'*/);
var inherit = require('/raptor-util$3.2.0/inherit'/*'raptor-util/inherit'*/);
var updateManager = require('/marko$4.1.3/components/update-manager'/*'./update-manager'*/);
var morphdom = require('/marko$4.1.3/morphdom/index'/*'../morphdom'*/);
var eventDelegation = require('/marko$4.1.3/components/event-delegation'/*'./event-delegation'*/);

var slice = Array.prototype.slice;

var MORPHDOM_SKIP = true;

var COMPONENT_SUBSCRIBE_TO_OPTIONS;
var NON_COMPONENT_SUBSCRIBE_TO_OPTIONS = {
    addDestroyListener: false
};

var emit = EventEmitter.prototype.emit;

function removeListener(removeEventListenerHandle) {
    removeEventListenerHandle();
}

function checkCompatibleComponent(componentsContext, el) {
    var component = el._w;
    while(component) {
        var id = component.id;
        var newComponentDef = componentsContext.$__componentsById[id];
        if (newComponentDef && component.$__type == newComponentDef.$__component.$__type) {
            break;
        }

        var rootFor = component.$__rootFor;
        if (rootFor)  {
            component = rootFor;
        } else {
            component.$__destroyShallow();
            break;
        }
    }
}

function handleCustomEventWithMethodListener(component, targetMethodName, args, extraArgs) {
    // Remove the "eventType" argument
    args.push(component);

    if (extraArgs) {
        args = extraArgs.concat(args);
    }


    var targetComponent = componentLookup[component.$__scope];
    var targetMethod = targetComponent[targetMethodName];
    if (!targetMethod) {
        throw Error('Method not found: ' + targetMethodName);
    }

    targetMethod.apply(targetComponent, args);
}

function getElIdHelper(component, componentElId, index) {
    var id = component.id;

    var elId = componentElId != null ? id + '-' + componentElId : id;

    if (index != null) {
        elId += '[' + index + ']';
    }

    return elId;
}

/**
 * This method is used to process "update_<stateName>" handler functions.
 * If all of the modified state properties have a user provided update handler
 * then a rerender will be bypassed and, instead, the DOM will be updated
 * looping over and invoking the custom update handlers.
 * @return {boolean} Returns true if if the DOM was updated. False, otherwise.
 */
function processUpdateHandlers(component, stateChanges, oldState) {
    var handlerMethod;
    var handlers;

    for (var propName in stateChanges) {
        if (stateChanges.hasOwnProperty(propName)) {
            var handlerMethodName = 'update_' + propName;

            handlerMethod = component[handlerMethodName];
            if (handlerMethod) {
                (handlers || (handlers=[])).push([propName, handlerMethod]);
            } else {
                // This state change does not have a state handler so return false
                // to force a rerender
                return;
            }
        }
    }

    // If we got here then all of the changed state properties have
    // an update handler or there are no state properties that actually
    // changed.
    if (handlers) {
        // Otherwise, there are handlers for all of the changed properties
        // so apply the updates using those handlers

        handlers.forEach(function(handler, i) {
            var propertyName = handler[0];
            handlerMethod = handler[1];

            var newValue = stateChanges[propertyName];
            var oldValue = oldState[propertyName];
            handlerMethod.call(component, newValue, oldValue);
        });

        emitLifecycleEvent(component, 'update');

        component.$__reset();
    }

    return true;
}

function checkInputChanged(existingComponent, oldInput, newInput) {
    if (oldInput != newInput) {
        if (oldInput == null || newInput == null) {
            return true;
        }

        var oldKeys = Object.keys(oldInput);
        var newKeys = Object.keys(newInput);
        var len = oldKeys.length;
        if (len !== newKeys.length) {
            return true;
        }

        for (var i=0; i<len; i++) {
            var key = oldKeys[i];
            if (oldInput[key] !== newInput[key]) {
                return true;
            }
        }
    }

    return false;
}

function onNodeDiscarded(node) {
    if (node.nodeType == 1) {
        destroyComponentForEl(node);
    }
}

function onBeforeNodeDiscarded(node) {
    return eventDelegation.$__handleNodeDetach(node);
}

function onBeforeElUpdated(fromEl, componentsContext) {
    var id = fromEl.id;

    if (componentsContext && id) {
        var preserved = componentsContext.$__preserved[id];

        if (preserved && !preserved.$__bodyOnly) {
            // Don't morph elements that are associated with components that are being
            // reused or elements that are being preserved. For components being reused,
            // the morphing will take place when the reused component updates.
            return MORPHDOM_SKIP;
        } else {
            // We may need to destroy a Component associated with the current element
            // if a new UI component was rendered to the same element and the types
            // do not match
            checkCompatibleComponent(componentsContext, fromEl);
        }
    }
}

function onBeforeElChildrenUpdated(el, componentsContext) {
    var id = el.id;
    if (componentsContext && id) {
        var preserved = componentsContext.$__preserved[id];
        if (preserved && preserved.$__bodyOnly) {
            // Don't morph the children since they are preserved
            return MORPHDOM_SKIP;
        }
    }
}

function onNodeAdded(node, componentsContext) {
    eventDelegation.$__handleNodeAttach(node, componentsContext.$__out);
}

var componentProto;

/**
 * Base component type.
 *
 * NOTE: Any methods that are prefixed with an underscore should be considered private!
 */
function Component(id, doc) {
    EventEmitter.call(this);
    this.id = id;
    this.el = null;
    this.$__state = null;
    this.$__roots = null;
    this.$__subscriptions = null;
    this.$__domEventListenerHandles = null;
    this.$__bubblingDomEvents = null;
    this.$__customEvents = null;
    this.$__scope = null;
    this.$__renderInput = null;
    this.$__input = undefined;

    this.$__destroyed =
        this.$__updateQueued =
        this.$__dirty =
        this.$__settingInput =
        false;

    this.$__document = doc;
}

Component.prototype = componentProto = {
    $__isComponent: true,

    subscribeTo: function(target) {
        if (!target) {
            throw TypeError();
        }

        var subscriptions = this.$__subscriptions || (this.$__subscriptions = new SubscriptionTracker());

        var subscribeToOptions = target.$__isComponent ?
            COMPONENT_SUBSCRIBE_TO_OPTIONS :
            NON_COMPONENT_SUBSCRIBE_TO_OPTIONS;

        return subscriptions.subscribeTo(target, subscribeToOptions);
    },

    emit: function(eventType) {
        var customEvents = this.$__customEvents;
        var target;

        if (customEvents && (target = customEvents[eventType])) {
            var targetMethodName = target[0];
            var extraArgs = target[1];
            var args = slice.call(arguments, 1);

            handleCustomEventWithMethodListener(this, targetMethodName, args, extraArgs);
        }

        if (this.listenerCount(eventType)) {
            return emit.apply(this, arguments);
        }
    },
    getElId: function (componentElId, index) {
        return getElIdHelper(this, componentElId, index);
    },
    getEl: function (componentElId, index) {
        var doc = this.$__document;

        if (componentElId != null) {
            return getElementById(doc, getElIdHelper(this, componentElId, index));
        } else {
            return this.el || getElementById(doc, getElIdHelper(this));
        }
    },
    getEls: function(id) {
        var els = [];
        var i = 0;
        var el;
        while((el = this.getEl(id, i))) {
            els.push(el);
            i++;
        }
        return els;
    },
    getComponent: function(id, index) {
        return componentLookup[getElIdHelper(this, id, index)];
    },
    getComponents: function(id) {
        var components = [];
        var i = 0;
        var component;
        while((component = componentLookup[getElIdHelper(this, id, i)])) {
            components.push(component);
            i++;
        }
        return components;
    },
    destroy: function() {
        if (this.$__destroyed) {
            return;
        }

        var els = this.els;

        this.$__destroyShallow();

        var rootComponents = this.$__rootComponents;
        if (rootComponents) {
            rootComponents.forEach(function(rootComponent) {
                rootComponent.$__destroy();
            });
        }

        els.forEach(function(el) {
            destroyElRecursive(el);

            var parentNode = el.parentNode;
            if (parentNode) {
                parentNode.removeChild(el);
            }
        });
    },

    $__destroyShallow: function() {
        if (this.$__destroyed) {
            return;
        }

        emitLifecycleEvent(this, 'destroy');
        this.$__destroyed = true;

        this.el = null;

        // Unsubscribe from all DOM events
        this.$__removeDOMEventListeners();

        var subscriptions = this.$__subscriptions;
        if (subscriptions) {
            subscriptions.removeAllListeners();
            this.$__subscriptions = null;
        }

        delete componentLookup[this.id];
    },

    isDestroyed: function() {
        return this.$__destroyed;
    },
    get state() {
        return this.$__state;
    },
    set state(newState) {
        var state = this.$__state;
        if (!state && !newState) {
            return;
        }

        if (!state) {
                state = this.$__state = new this.$__State(this);
        }

        state.$__replace(newState || {});

        if (state.$__dirty) {
            this.$__queueUpdate();
        }

        if (!newState) {
            this.$__state = null;
        }
    },
    setState: function(name, value) {
        var state = this.$__state;

        if (typeof name == 'object') {
            // Merge in the new state with the old state
            var newState = name;
            for (var k in newState) {
                if (newState.hasOwnProperty(k)) {
                    state.$__set(k, newState[k], true /* ensure:true */);
                }
            }
        } else {
            state.$__set(name, value, true /* ensure:true */);
        }
    },

    setStateDirty: function(name, value) {
        var state = this.$__state;

        if (arguments.length == 1) {
            value = state[name];
        }

        state.$__set(name, value, true /* ensure:true */, true /* forceDirty:true */);
    },

    replaceState: function(newState) {
        this.$__state.$__replace(newState);
    },

    get input() {
        return this.$__input;
    },
    set input(newInput) {
        if (this.$__settingInput) {
            this.$__input = newInput;
        } else {
            this.$__setInput(newInput);
        }
    },

    $__setInput: function(newInput, onInput, out) {
        onInput = onInput || this.onInput;
        var updatedInput;

        var oldInput = this.$__input;
        this.$__input = undefined;

        if (onInput) {
            // We need to set a flag to preview `this.input = foo` inside
            // onInput causing infinite recursion
            this.$__settingInput = true;
            updatedInput = onInput.call(this, newInput || {}, out);
            this.$__settingInput = false;
        }

        newInput = this.$__renderInput = updatedInput || newInput;

        if ((this.$__dirty = checkInputChanged(this, oldInput, newInput))) {
            this.$__queueUpdate();
        }

        if (this.$__input === undefined) {
            this.$__input = newInput;
        }

        return newInput;
    },

    forceUpdate: function() {
        this.$__dirty = true;
        this.$__queueUpdate();
    },

    $__queueUpdate: function() {
        if (!this.$__updateQueued) {
            updateManager.$__queueComponentUpdate(this);
        }
    },

    update: function() {
        if (this.$__destroyed || !this.$__isDirty) {
            return;
        }

        var input = this.$__input;
        var state = this.$__state;

        if (!this.$__dirty && state && state.$__dirty) {
            if (processUpdateHandlers(this, state.$__changes, state.$__old, state)) {
                state.$__dirty = false;
            }
        }

        if (this.$__isDirty) {
            // The UI component is still dirty after process state handlers
            // then we should rerender

            if (this.shouldUpdate(input, state) !== false) {
                this.$__rerender();
            }
        }

        this.$__reset();
    },


    get $__isDirty() {
        return this.$__dirty || (this.$__state && this.$__state.$__dirty);
    },

    $__reset: function() {
        this.$__dirty = false;
        this.$__updateQueued = false;
        this.$__renderInput = null;
        var state = this.$__state;
        if (state) {
            state.$__reset();
        }
    },

    shouldUpdate: function(newState, newProps) {
        return true;
    },

    $__emitLifecycleEvent: function(eventType, eventArg1, eventArg2) {
        emitLifecycleEvent(this, eventType, eventArg1, eventArg2);
    },

    $__rerender: function(input) {
        if (input) {
            this.input = input;
        }

        var self = this;
        var renderer = self.$__renderer;

        if (!renderer) {
            throw TypeError();
        }

        var globalData = {
            $w: self
        };

        var fromEls = self.$__getRootEls({});
        var doc = self.$__document;
        input = this.$__renderInput || this.$__input;

        updateManager.$__batchUpdate(function() {
            var createOut = renderer.createOut || marko.createOut;
            var out = createOut(globalData);
            out.$__document = self.$__document;
            renderer(input, out);
            var result = new RenderResult(out);
            var targetNode = out.$__getOutput();

            var componentsContext = out.global.components;

            var fromEl;

            var targetEl = targetNode.firstChild;
            while(targetEl) {
                var id = targetEl.id;

                if (id) {
                    fromEl = fromEls[id];
                    if (fromEl) {
                        morphdom(
                            fromEl,
                            targetEl,
                            componentsContext,
                            onNodeAdded,
                            onBeforeElUpdated,
                            onBeforeNodeDiscarded,
                            onNodeDiscarded,
                            onBeforeElChildrenUpdated);
                    }
                }

                targetEl = targetEl.nextSibling;
            }

            result.afterInsert(doc);

            out.emit('$__componentsInitialized');
        });

        this.$__reset();
    },

    $__getRootEls: function(rootEls) {
        var i, len;

        var componentEls = this.els;

        for (i=0, len=componentEls.length; i<len; i++) {
            var componentEl = componentEls[i];
            rootEls[componentEl.id] = componentEl;
        }

        var rootComponents = this.$__rootComponents;
        if (rootComponents) {
            for (i=0, len=rootComponents.length; i<len; i++) {
                var rootComponent = rootComponents[i];
                rootComponent.$__getRootEls(rootEls);
            }
        }

        return rootEls;
    },

    $__removeDOMEventListeners: function() {
        var eventListenerHandles = this.$__domEventListenerHandles;
        if (eventListenerHandles) {
            eventListenerHandles.forEach(removeListener);
            this.$__domEventListenerHandles = null;
        }
    },

    get $__rawState() {
        var state = this.$__state;
        return state && state.$__raw;
    },

    $__setCustomEvents: function(customEvents, scope) {
        if (customEvents) {
            var finalCustomEvents = this.$__customEvents = {};
            this.$__scope = scope;

            customEvents.forEach(function(customEvent) {
                var eventType = customEvent[0];
                var targetMethodName = customEvent[1];
                var extraArgs = customEvent[2];

                finalCustomEvents[eventType] = [targetMethodName, extraArgs];
            });
        }
    }
};

componentProto.elId = componentProto.getElId;
componentProto.$__update = componentProto.update;
componentProto.$__destroy = componentProto.destroy;

// Add all of the following DOM methods to Component.prototype:
// - appendTo(referenceEl)
// - replace(referenceEl)
// - replaceChildrenOf(referenceEl)
// - insertBefore(referenceEl)
// - insertAfter(referenceEl)
// - prependTo(referenceEl)
domInsert(
    componentProto,
    function getEl(component) {
        var els = this.els;
        var elCount = els.length;
        if (elCount > 1) {
            var fragment = component.$__document.createDocumentFragment();
            els.forEach(function(el) {
                fragment.appendChild(el);
            });
            return fragment;
        } else {
            return els[0];
        }
    },
    function afterInsert(component) {
        return component;
    });

inherit(Component, EventEmitter);

module.exports = Component;

});
$_mod.def("/marko$4.1.3/components/defineComponent", function(require, exports, module, __filename, __dirname) { 'use strict';
/* jshint newcap:false */

var BaseState = require('/marko$4.1.3/components/State'/*'./State'*/);
var BaseComponent = require('/marko$4.1.3/components/Component'/*'./Component'*/);
var inherit = require('/raptor-util$3.2.0/inherit'/*'raptor-util/inherit'*/);

module.exports = function defineComponent(def, renderer) {
    if (def.$__isComponent) {
        return def;
    }

    var ComponentClass;
    var proto;

    var type = typeof def;

    if (type == 'function') {
        ComponentClass = def;
        proto = ComponentClass.prototype;
    } else if (type == 'object') {
        ComponentClass = function() {};
        proto = ComponentClass.prototype = def;
    } else {
        throw TypeError();
    }

    // We don't use the constructor provided by the user
    // since we don't invoke their constructor until
    // we have had a chance to do our own initialization.
    // Instead, we store their constructor in the "initComponent"
    // property and that method gets called later inside
    // init-components-browser.js
    function Component(id, doc) {
        BaseComponent.call(this, id, doc);
    }

    if (!proto.$__isComponent) {
        // Inherit from Component if they didn't already
        inherit(ComponentClass, BaseComponent);
    }

    // The same prototype will be used by our constructor after
    // we he have set up the prototype chain using the inherit function
    proto = Component.prototype = ComponentClass.prototype;

    // proto.constructor = def.constructor = Component;

    // Set a flag on the constructor function to make it clear this is
    // a component so that we can short-circuit this work later
    Component.$__isComponent = true;

    function State() { BaseState.apply(this, arguments); }
    inherit(State, BaseState);
    proto.$__State = State;
    proto.$__renderer = renderer;

    return Component;
};

});
$_mod.def("/marko$4.1.3/components/registry-browser", function(require, exports, module, __filename, __dirname) { var loadComponent = require('/marko$4.1.3/components/loadComponent-dynamic'/*'./loadComponent'*/);
var defineComponent = require('/marko$4.1.3/components/defineComponent'/*'./defineComponent'*/);

var registered = {};
var loaded = {};
var componentTypes = {};

function register(typeName, def) {
    // We do this to kick off registering of nested components
    // but we don't use the return value just yet since there
    // is a good chance that it resulted in a circular dependency
    def();

    registered[typeName] = def;
    delete loaded[typeName];
    delete componentTypes[typeName];
    return typeName;
}

function load(typeName) {
    var target = loaded[typeName];
    if (!target) {
        target = registered[typeName];

        if (target) {
            target = target();
        } else {
            target = loadComponent(typeName); // Assume the typeName has been fully resolved already
        }

        if (!target) {
            throw Error('Not found: ' + typeName);
        }

        loaded[typeName] = target;
    }

    return target;
}

function getComponentClass(typeName) {
    var ComponentClass = componentTypes[typeName];

    if (ComponentClass) {
        return ComponentClass;
    }

    ComponentClass = load(typeName);

    ComponentClass = ComponentClass.Component || ComponentClass;

    if (!ComponentClass.$__isComponent) {
        ComponentClass = defineComponent(ComponentClass, ComponentClass.renderer);
    }

    // Make the component "type" accessible on each component instance
    ComponentClass.prototype.$__type = typeName;

    componentTypes[typeName] = ComponentClass;

    return ComponentClass;
}

function createComponent(typeName, id) {
    var ComponentClass = getComponentClass(typeName);
    return new ComponentClass(id);
}

exports.$__register = register;
exports.$__createComponent = createComponent;

});
$_mod.def("/marko$4.1.3/components/ComponentDef", function(require, exports, module, __filename, __dirname) { 'use strict';
var nextRepeatedId = require('/marko$4.1.3/components/nextRepeatedId'/*'./nextRepeatedId'*/);
var repeatedRegExp = /\[\]$/;
var componentUtil = require('/marko$4.1.3/components/util-browser'/*'./util'*/);
var nextComponentId = componentUtil.$__nextComponentId;
var attachBubblingEvent = componentUtil.$__attachBubblingEvent;

var extend = require('/raptor-util$3.2.0/extend'/*'raptor-util/extend'*/);
var registry = require('/marko$4.1.3/components/registry-browser'/*'./registry'*/);

/**
 * A ComponentDef is used to hold the metadata collected at runtime for
 * a single component and this information is used to instantiate the component
 * later (after the rendered HTML has been added to the DOM)
 */
function ComponentDef(component, componentId, out, componentStack, componentStackLen) {
    this.$__out = out; // The AsyncWriter that this component is associated with
    this.$__componentStack = componentStack;
    this.$__componentStackLen = componentStackLen;
    this.$__component = component;
    this.id = componentId;

    this.$__roots =  null;            // IDs of root elements if there are multiple root elements
    this.$__children = null;          // An array of nested ComponentDef instances
    this.$__domEvents = null;         // An array of DOM events that need to be added (in sets of three)
    this.$__bubblingDomEvents = null; // Used to keep track of bubbling DOM events for components rendered on the server

    this.$__isExisting = false;

    this.$__nextIdIndex = 0; // The unique integer to use for the next scoped ID
}

ComponentDef.prototype = {
    $__end: function() {
        this.$__componentStack.length = this.$__componentStackLen;
    },

    /**
     * Register a nested component for this component. We maintain a tree of components
     * so that we can instantiate nested components before their parents.
     */
    $__addChild: function (componentDef) {
        var children = this.$__children;

        if (children) {
            children.push(componentDef);
        } else {
            this.$__children = [componentDef];
        }
    },
    /**
     * This helper method generates a unique and fully qualified DOM element ID
     * that is unique within the scope of the current component. This method prefixes
     * the the nestedId with the ID of the current component. If nestedId ends
     * with `[]` then it is treated as a repeated ID and we will generate
     * an ID with the current index for the current nestedId.
     * (e.g. "myParentId-foo[0]", "myParentId-foo[1]", etc.)
     */
    elId: function (nestedId) {
        var id = this.id;
        if (nestedId == null) {
            return id;
        } else {
            if (typeof nestedId == 'string' && repeatedRegExp.test(nestedId)) {
                return nextRepeatedId(this.$__out, id, nestedId);
            } else {
                return id + '-' + nestedId;
            }
        }
    },
    /**
     * Registers a DOM event for a nested HTML element associated with the
     * component. This is only done for non-bubbling events that require
     * direct event listeners to be added.
     * @param  {String} type The DOM event type ("mouseover", "mousemove", etc.)
     * @param  {String} targetMethod The name of the method to invoke on the scoped component
     * @param  {String} elId The DOM element ID of the DOM element that the event listener needs to be added too
     */
     e: function(type, targetMethod, elId, extraArgs) {
        if (targetMethod) {
            // The event handler method is allowed to be conditional. At render time if the target
            // method is null then we do not attach any direct event listeners.
            (this.$__domEvents || (this.$__domEvents = [])).push([
                type,
                targetMethod,
                elId,
                extraArgs]);
        }
    },
    /**
     * Returns the next auto generated unique ID for a nested DOM element or nested DOM component
     */
    $__nextId: function() {
        var id = this.id;

        return id ?
            id + '-c' + (this.$__nextIdIndex++) :
            nextComponentId(this.$__out);
    },

    d: function(handlerMethodName, extraArgs) {
        return attachBubblingEvent(this, handlerMethodName, extraArgs);
    }
};

ComponentDef.$__deserialize = function(o, types) {
    var id        = o[0];
    var typeName  = types[o[1]];
    var input     = o[2];
    var extra     = o[3];

    var state = extra.s;
    var componentProps = extra.w;

    var component = typeName /* legacy */ && registry.$__createComponent(typeName, id);

    if (extra.b) {
        component.$__bubblingDomEvents = extra.b;
    }

    // Preview newly created component from being queued for update since we area
    // just building it from the server info
    component.$__updateQueued = true;

    if (state) {
        var undefinedPropNames = extra.u;
        if (undefinedPropNames) {
            undefinedPropNames.forEach(function(undefinedPropName) {
                state[undefinedPropName] = undefined;
            });
        }
        // We go through the setter here so that we convert the state object
        // to an instance of `State`
        component.state = state;
    }

    component.$__input = input;

    if (componentProps) {
        extend(component, componentProps);
    }

    var scope = extra.p;
    var customEvents = extra.e;
    component.$__setCustomEvents(customEvents, scope);

    return {
        $__component: component,
        $__roots: extra.r,
        $__domEvents: extra.d
    };
};

module.exports = ComponentDef;

});
$_mod.def("/marko$4.1.3/components/init-components-browser", function(require, exports, module, __filename, __dirname) { 'use strict';
var warp10Finalize = require('/warp10$1.3.4/finalize'/*'warp10/finalize'*/);
var eventDelegation = require('/marko$4.1.3/components/event-delegation'/*'./event-delegation'*/);
var win = window;
var defaultDocument = document;
var events = require('/marko$4.1.3/runtime/events'/*'../runtime/events'*/);
var componentsUtil = require('/marko$4.1.3/components/util-browser'/*'./util'*/);
var componentLookup = componentsUtil.$__componentLookup;
var getElementById = componentsUtil.$__getElementById;
var ComponentDef = require('/marko$4.1.3/components/ComponentDef'/*'./ComponentDef'*/);
// var extend = require('raptor-util/extend');
// var registry = require('./registry');

function invokeComponentEventHandler(component, targetMethodName, args) {
    var method = component[targetMethodName];
    if (!method) {
        throw Error('Method not found: ' + targetMethodName);
    }

    method.apply(component, args);
}

function addEventListenerHelper(el, eventType, listener) {
    el.addEventListener(eventType, listener, false);
    return function remove() {
        el.removeEventListener(eventType, listener);
    };
}

function addDOMEventListeners(component, el, eventType, targetMethodName, extraArgs, handles) {
    var removeListener = addEventListenerHelper(el, eventType, function(event) {
        var args = [event, el];
        if (extraArgs) {
            args = extraArgs.concat(args);
        }

        invokeComponentEventHandler(component, targetMethodName, args);
    });
    handles.push(removeListener);
}

function initComponent(componentDef, doc) {
    var component = componentDef.$__component;

    if (!component || !component.$__isComponent) {
        return; // legacy
    }

    var domEvents = componentDef.$__domEvents;

    component.$__reset();
    component.$__document = doc;

    var isExisting = componentDef.$__isExisting;
    var id = component.id;

    var rootIds = componentDef.$__roots;

    if (rootIds) {
        var rootComponents;

        var els = [];

        rootIds.forEach(function(rootId) {
            var nestedId = id + '-' + rootId;
            var rootComponent = componentLookup[nestedId];
            if (rootComponent) {
                rootComponent.$__rootFor = component;
                if (rootComponents) {
                    rootComponents.push(rootComponent);
                } else {
                    rootComponents = component.$__rootComponents = [rootComponent];
                }
            } else {
                var rootEl = getElementById(doc, nestedId);
                if (rootEl) {
                    rootEl._w = component;
                    els.push(rootEl);
                }
            }
        });

        component.el = els[0];
        component.els = els;
        componentLookup[id] = component;
    } else if (!isExisting) {
        var el = getElementById(doc, id);
        el._w = component;
        component.el = el;
        component.els = [el];
        componentLookup[id] = component;
    }

    if (isExisting) {
        component.$__removeDOMEventListeners();
    }

    if (domEvents) {
        var eventListenerHandles = [];

        domEvents.forEach(function(domEventArgs) {
            // The event mapping is for a direct DOM event (not a custom event and not for bubblign dom events)

            var eventType = domEventArgs[0];
            var targetMethodName = domEventArgs[1];
            var eventEl = getElementById(doc, domEventArgs[2]);
            var extraArgs = domEventArgs[3];

            addDOMEventListeners(component, eventEl, eventType, targetMethodName, extraArgs, eventListenerHandles);
        });

        if (eventListenerHandles.length) {
            component.$__domEventListenerHandles = eventListenerHandles;
        }
    }

    if (isExisting) {
        component.$__emitLifecycleEvent('update');
    } else {
        events.emit('mountComponent', component);
        component.$__emitLifecycleEvent('mount');
    }
}

/**
 * This method is used to initialized components associated with UI components
 * rendered in the browser. While rendering UI components a "components context"
 * is added to the rendering context to keep up with which components are rendered.
 * When ready, the components can then be initialized by walking the component tree
 * in the components context (nested components are initialized before ancestor components).
 * @param  {Array<marko-components/lib/ComponentDef>} componentDefs An array of ComponentDef instances
 */
function initClientRendered(componentDefs, doc) {
    // Ensure that event handlers to handle delegating events are
    // always attached before initializing any components
    eventDelegation.$__init(doc);

    doc = doc || defaultDocument;
    for (var i=0,len=componentDefs.length; i<len; i++) {
        var componentDef = componentDefs[i];

        if (componentDef.$__children) {
            initClientRendered(componentDef.$__children, doc);
        }

        initComponent(
            componentDef,
            doc);
    }
}

/**
 * This method initializes all components that were rendered on the server by iterating over all
 * of the component IDs.
 */
function initServerRendered(renderedComponents, doc) {
    if (!renderedComponents) {
        renderedComponents = win.$components;

        if (renderedComponents) {
            if (renderedComponents.forEach) {
                renderedComponents.forEach(function(renderedComponent) {
                    initServerRendered(renderedComponent, doc);
                });
            }
        } else {
            win.$components = {
                concat: initServerRendered
            };
        }
        return;
    }
    // Ensure that event handlers to handle delegating events are
    // always attached before initializing any components
    eventDelegation.$__init(doc || defaultDocument);

    renderedComponents = warp10Finalize(renderedComponents);

    var componentDefs = renderedComponents.w;
    var typesArray = renderedComponents.t;

    componentDefs.forEach(function(componentDef) {
        componentDef = ComponentDef.$__deserialize(componentDef, typesArray);
        initComponent(componentDef, doc || defaultDocument);
    });
}

exports.$__initClientRendered = initClientRendered;
exports.$__initServerRendered = initServerRendered;
});
$_mod.def("/marko$4.1.3/components/boot", function(require, exports, module, __filename, __dirname) { require('/marko$4.1.3/components/init-components-browser'/*'./init-components'*/).$__initServerRendered();
});
$_mod.run("/marko$4.1.3/components/boot");
$_mod.def("/marko$4.1.3/components/util-browser", function(require, exports, module, __filename, __dirname) { var markoGlobal = window.$MG || (window.$MG = {
    uid: 0
});

var runtimeId = markoGlobal.uid++;

var componentLookup = {};

var defaultDocument = document;

function getComponentForEl(el, doc) {
    if (el) {
        var node = typeof el == 'string' ? (doc || defaultDocument).getElementById(el) : el;
        if (node) {
            var component = node._w;

            while(component) {
                var rootFor = component.$__rootFor;
                if (rootFor)  {
                    component = rootFor;
                } else {
                    break;
                }
            }

            return component;
        }
    }
}

var lifecycleEventMethods = {};

[
    'create',
    'render',
    'update',
    'mount',
    'destroy',
].forEach(function(eventName) {
    lifecycleEventMethods[eventName] = 'on' + eventName[0].toUpperCase() + eventName.substring(1);
});

/**
 * This method handles invoking a component's event handler method
 * (if present) while also emitting the event through
 * the standard EventEmitter.prototype.emit method.
 *
 * Special events and their corresponding handler methods
 * include the following:
 *
 * beforeDestroy --> onBeforeDestroy
 * destroy       --> onDestroy
 * beforeUpdate  --> onBeforeUpdate
 * update        --> onUpdate
 * render        --> onRender
 */
function emitLifecycleEvent(component, eventType, eventArg1, eventArg2) {
    var listenerMethod = component[lifecycleEventMethods[eventType]];

    if (listenerMethod) {
        listenerMethod.call(component, eventArg1, eventArg2);
    }

    component.emit(eventType, eventArg1, eventArg2);
}

function destroyComponentForEl(el) {
    var componentToDestroy = el._w;
    if (componentToDestroy) {
        componentToDestroy.$__destroyShallow();
        el._w = null;

        while ((componentToDestroy = componentToDestroy.$__rootFor)) {
            componentToDestroy.$__rootFor = null;
            componentToDestroy.$__destroyShallow();
        }
    }
}
function destroyElRecursive(el) {
    var curChild = el.firstChild;
    while(curChild) {
        if (curChild.nodeType == 1) {
            destroyComponentForEl(curChild);
            destroyElRecursive(curChild);
        }
        curChild = curChild.nextSibling;
    }
}

function nextComponentId() {
    // Each component will get an ID that is unique across all loaded
    // marko runtimes. This allows multiple instances of marko to be
    // loaded in the same window and they should all place nice
    // together
    return 'b' + ((markoGlobal.uid)++);
}

function getElementById(doc, id) {
    return doc.getElementById(id);
}

function attachBubblingEvent(componentDef, handlerMethodName, extraArgs) {
    if (handlerMethodName) {
        var id = componentDef.id;

        return extraArgs ?
            [handlerMethodName, id, extraArgs] :
            [handlerMethodName, id];
    }
}

exports.$__runtimeId = runtimeId;
exports.$__componentLookup = componentLookup;
exports.$__getComponentForEl = getComponentForEl;
exports.$__emitLifecycleEvent = emitLifecycleEvent;
exports.$__destroyComponentForEl = destroyComponentForEl;
exports.$__destroyElRecursive = destroyElRecursive;
exports.$__nextComponentId = nextComponentId;
exports.$__getElementById = getElementById;
exports.$__attachBubblingEvent = attachBubblingEvent;

});
$_mod.def("/marko$4.1.3/runtime/dom-insert", function(require, exports, module, __filename, __dirname) { var extend = require('/raptor-util$3.2.0/extend'/*'raptor-util/extend'*/);
var componentsUtil = require('/marko$4.1.3/components/util-browser'/*'../components/util'*/);
var destroyComponentForEl = componentsUtil.$__destroyComponentForEl;
var destroyElRecursive = componentsUtil.$__destroyElRecursive;

function resolveEl(el) {
    if (typeof el == 'string') {
        var elId = el;
        el = document.getElementById(elId);
        if (!el) {
            throw Error('Not found: ' + elId);
        }
    }
    return el;
}

function beforeRemove(referenceEl) {
    destroyElRecursive(referenceEl);
    destroyComponentForEl(referenceEl);
}

module.exports = function(target, getEl, afterInsert) {
    extend(target, {
        appendTo: function(referenceEl) {
            referenceEl = resolveEl(referenceEl);
            var el = getEl(this, referenceEl);
            referenceEl.appendChild(el);
            return afterInsert(this, referenceEl);
        },
        prependTo: function(referenceEl) {
            referenceEl = resolveEl(referenceEl);
            var el = getEl(this, referenceEl);
            referenceEl.insertBefore(el, referenceEl.firstChild || null);
            return afterInsert(this, referenceEl);
        },
        replace: function(referenceEl) {
            referenceEl = resolveEl(referenceEl);
            var el = getEl(this, referenceEl);
            beforeRemove(referenceEl);
            referenceEl.parentNode.replaceChild(el, referenceEl);
            return afterInsert(this, referenceEl);
        },
        replaceChildrenOf: function(referenceEl) {
            referenceEl = resolveEl(referenceEl);
            var el = getEl(this, referenceEl);

            var curChild = referenceEl.firstChild;
            while(curChild) {
                var nextSibling = curChild.nextSibling; // Just in case the DOM changes while removing
                if (curChild.nodeType == 1) {
                    beforeRemove(curChild);
                }
                curChild = nextSibling;
            }

            referenceEl.innerHTML = '';
            referenceEl.appendChild(el);
            return afterInsert(this, referenceEl);
        },
        insertBefore: function(referenceEl) {
            referenceEl = resolveEl(referenceEl);
            var el = getEl(this, referenceEl);
            referenceEl.parentNode.insertBefore(el, referenceEl);
            return afterInsert(this, referenceEl);
        },
        insertAfter: function(referenceEl) {
            referenceEl = resolveEl(referenceEl);
            var el = getEl(this, referenceEl);
            el = el;
            var nextSibling = referenceEl.nextSibling;
            var parentNode = referenceEl.parentNode;
            if (nextSibling) {
                parentNode.insertBefore(el, nextSibling);
            } else {
                parentNode.appendChild(el);
            }
            return afterInsert(this, referenceEl);
        }
    });
};

});
$_mod.def("/marko$4.1.3/runtime/RenderResult", function(require, exports, module, __filename, __dirname) { var domInsert = require('/marko$4.1.3/runtime/dom-insert'/*'./dom-insert'*/);
var EMPTY_ARRAY = [];


function getComponentDefs(result) {
    var componentDefs = result.$__components;

    if (!componentDefs.length) {
        throw Error('No component');
    }
    return componentDefs;
}

function RenderResult(out) {
   this.out = this.$__out = out;
   this.$__components = undefined;
}

module.exports = RenderResult;

var proto = RenderResult.prototype = {
    getComponent: function() {
        return this.getComponents()[0];
    },
    getComponents: function(selector) {
        if (!this.$__components) {
            throw Error('Not added to DOM');
        }

        var componentDefs = getComponentDefs(this);

        var components = [];

        componentDefs.forEach(function(componentDef) {
            var component = componentDef.$__component;
            if (!selector || selector(component)) {
                components.push(component);
            }
        });

        return components;
    },

    afterInsert: function(doc) {
        var out = this.$__out;
        var componentsContext = out.global.components;
        if (componentsContext) {
            this.$__components = componentsContext.$__components;
            componentsContext.$__initComponents(doc);
        } else {
            this.$__components = EMPTY_ARRAY;
        }

        return this;
    },
    getNode: function(doc) {
        return this.$__out.$__getNode(doc);
    },
    getOutput: function() {
        return this.$__out.$__getOutput();
    },
    toString: function() {
        return this.$__out.toString();
    },
    document: typeof document != 'undefined' && document
};

// Add all of the following DOM methods to Component.prototype:
// - appendTo(referenceEl)
// - replace(referenceEl)
// - replaceChildrenOf(referenceEl)
// - insertBefore(referenceEl)
// - insertAfter(referenceEl)
// - prependTo(referenceEl)
domInsert(
    proto,
    function getEl(renderResult, referenceEl) {
        return renderResult.getNode(referenceEl.ownerDocument);
    },
    function afterInsert(renderResult, referenceEl) {
        return renderResult.afterInsert(referenceEl.ownerDocument);
    });

});
$_mod.def("/marko$4.1.3/runtime/vdom/AsyncVDOMBuilder", function(require, exports, module, __filename, __dirname) { var EventEmitter = require('/events-light$1.0.5/src/index'/*'events-light'*/);
var vdom = require('/marko$4.1.3/runtime/vdom/vdom'/*'./vdom'*/);
var VElement = vdom.$__VElement;
var VDocumentFragment = vdom.$__VDocumentFragment;
var VComment = vdom.$__VComment;
var VText = vdom.$__VText;
var virtualizeHTML = vdom.$__virtualizeHTML;
var RenderResult = require('/marko$4.1.3/runtime/RenderResult'/*'../RenderResult'*/);
var defaultDocument = vdom.$__defaultDocument;

var FLAG_FINISHED = 1;
var FLAG_LAST_FIRED = 2;

var EVENT_UPDATE = 'update';
var EVENT_FINISH = 'finish';

function State(tree) {
    this.$__remaining = 1;
    this.$__events = new EventEmitter();
    this.$__tree = tree;
    this.$__last = null;
    this.$__lastCount = 0;
    this.$__flags = 0;
}

function AsyncVDOMBuilder(globalData, parentNode, state) {
    if (!parentNode) {
        parentNode = new VDocumentFragment();
    }

    if (state) {
        state.$__remaining++;
    } else {
        state = new State(parentNode);
    }

    this.data = {};
    this.$__state = state;
    this.$__parent = parentNode;
    this.global = globalData || {};
    this.$__stack = [parentNode];
    this.$__sync = false;
    this.$c = null; // Component args
}

var proto = AsyncVDOMBuilder.prototype = {
    $__isOut: true,
    $__document: defaultDocument,

    element: function(name, attrs, childCount, flags, constId) {
        var element = new VElement(name, attrs, childCount, flags, constId);

        var parent = this.$__parent;

        if(parent) {
            parent.$__appendChild(element);
        }

        return childCount === 0 ? this : element;
    },

    n: function(node) {
        // NOTE: We do a shallow clone since we assume the node is being reused
        //       and a node can only have one parent node.
        return this.node(node.$__cloneNode());
    },

    node: function(node) {
        var parent = this.$__parent;
        if (parent) {
            parent.$__appendChild(node);
        }
        return this;
    },

    text: function(text) {
        var type = typeof text;

        if (type != 'string') {
            if (text == null) {
                return;
            } else if (type == 'object') {
                if (text.toHTML) {
                    return this.h(text.toHTML());
                }
            }

            text = text.toString();
        }

        var parent = this.$__parent;
        if (parent) {
            var lastChild = parent.lastChild;
            if (lastChild && lastChild.$__Text) {
                lastChild.nodeValue += text;
            } else {
                parent.$__appendChild(new VText(text));
            }
        }
        return this;
    },

    comment: function(comment) {
        return this.node(new VComment(comment));
    },

    html: function(html) {
        if (html != null) {
            var vdomNode = virtualizeHTML(html, this.$__document);
            this.node(vdomNode);
        }

        return this;
    },

    beginElement: function(name, attrs, childCount, flags, constId) {
        var element = new VElement(name, attrs, childCount, flags, constId);
        var parent = this.$__parent;
        if (parent) {
            parent.$__appendChild(element);
            this.$__stack.push(element);
            this.$__parent = element;
        }
        return this;
    },

    endElement: function() {
        var stack = this.$__stack;
        stack.pop();
        this.$__parent = stack[stack.length-1];
    },

    end: function() {
        var state = this.$__state;

        this.$__parent = null;

        var remaining = --state.$__remaining;

        if (!(state.$__flags & FLAG_LAST_FIRED) && (remaining - state.$__lastCount === 0)) {
            state.$__flags |= FLAG_LAST_FIRED;
            state.$__lastCount = 0;
            state.$__events.emit('last');
        }

        if (!remaining) {
            state.$__flags |= FLAG_FINISHED;
            state.$__events.emit(EVENT_FINISH, this.$__getResult());
        }

        return this;
    },

    error: function(e) {
        try {
            this.emit('error', e);
        } finally {
            // If there is no listener for the error event then it will
            // throw a new Error here. In order to ensure that the async fragment
            // is still properly ended we need to put the end() in a `finally`
            // block
            this.end();
        }

        return this;
    },

    beginAsync: function(options) {
        if (this.$__sync) {
            throw Error('Not allowed');
        }

        var state = this.$__state;

        if (options) {
            if (options.last) {
                state.$__lastCount++;
            }
        }

        var documentFragment = this.$__parent.$__appendDocumentFragment();
        var asyncOut = new AsyncVDOMBuilder(this.global, documentFragment, state);

        state.$__events.emit('beginAsync', {
           out: asyncOut,
           parentOut: this
       });

       return asyncOut;
    },

    createOut: function(callback) {
        return new AsyncVDOMBuilder(this.global);
    },

    flush: function() {
        var events = this.$__state.$__events;

        if (events.listenerCount(EVENT_UPDATE)) {
            events.emit(EVENT_UPDATE, new RenderResult(this));
        }
    },

    $__getOutput: function() {
        return this.$__state.$__tree;
    },

    $__getResult: function() {
        return this.$__result || (this.$__result = new RenderResult(this));
    },

    on: function(event, callback) {
        var state = this.$__state;

        if (event === EVENT_FINISH && (state.$__flags & FLAG_FINISHED)) {
            callback(this.$__getResult());
        } else {
            state.$__events.on(event, callback);
        }

        return this;
    },

    once: function(event, callback) {
        var state = this.$__state;

        if (event === EVENT_FINISH && (state.$__flags & FLAG_FINISHED)) {
            callback(this.$__getResult());
            return this;
        }

        state.$__events.once(event, callback);
        return this;
    },

    emit: function(type, arg) {
        var events = this.$__state.$__events;
        switch(arguments.length) {
            case 1:
                events.emit(type);
                break;
            case 2:
                events.emit(type, arg);
                break;
            default:
                events.emit.apply(events, arguments);
                break;
        }
        return this;
    },

    removeListener: function() {
        var events = this.$__state.$__events;
        events.removeListener.apply(events, arguments);
        return this;
    },

    sync: function() {
        this.$__sync = true;
    },

    isSync: function() {
        return this.$__sync;
    },

    onLast: function(callback) {
        var state = this.$__state;

        var lastArray = state.$__last;

        if (!lastArray) {
            lastArray = state.$__last = [];
            var i = 0;
            var next = function() {
                if (i === lastArray.length) {
                    return;
                }
                var _next = lastArray[i++];
                _next(next);
            };

            this.once('last', function() {
                next();
            });
        }

        lastArray.push(callback);
        return this;
    },

    $__getNode: function(doc) {
        var node = this.$__VNode;
        if (!node) {
            var vdomTree = this.$__getOutput();

            if (!doc) {
                doc = this.$__document;
            }

            node = this.$__VNode = vdomTree.actualize(doc);
        }
        return node;
    },

    toString: function() {
        return this.$__getNode().outerHTML;
    },

    then: function(fn, fnErr) {
        var out = this;
        var promise = new Promise(function(resolve, reject) {
            out.on('error', reject)
                .on(EVENT_FINISH, function(result) {
                    resolve(result);
                });
        });

        return Promise.resolve(promise).then(fn, fnErr);
    },

    catch: function(fnErr) {
        return this.then(undefined, fnErr);
    },

    isVDOM: true
};

proto.e = proto.element;
proto.be = proto.beginElement;
proto.ee = proto.endElement;
proto.t = proto.text;
proto.h = proto.w = proto.write = proto.html;

module.exports = AsyncVDOMBuilder;

});
$_mod.def("/marko$4.1.3/runtime/renderable", function(require, exports, module, __filename, __dirname) { var defaultCreateOut = require('/marko$4.1.3/runtime/createOut'/*'./createOut'*/);
var extend = require('/raptor-util$3.2.0/extend'/*'raptor-util/extend'*/);

function safeRender(renderFunc, finalData, finalOut, shouldEnd) {
    try {
        renderFunc(finalData, finalOut);
        if (shouldEnd) {
            finalOut.end();
        }
    } catch(err) {
        setTimeout(function() {
            finalOut.error(err);
        }, 0);
    }
    return finalOut;
}

module.exports = function(target, renderer) {
    var renderFunc = renderer && (renderer.renderer || renderer.render || renderer);
    var createOut = target.createOut || renderer.createOut || defaultCreateOut;

    return extend(target, {
        createOut: createOut,

        renderToString: function(data, callback) {
            var localData = data || {};
            var render = renderFunc || this._;
            var globalData = localData.$global;
            var out = createOut(globalData);

            out.global.template = this;

            if (globalData) {
                localData.$global = undefined;
            }

            if (callback) {
                out.on('finish', function() {
                       callback(null, out.toString(), out);
                   })
                   .once('error', callback);

                return safeRender(render, localData, out, true);
            } else {
                out.sync();
                render(localData, out);
                return out.toString();
            }
        },

        renderSync: function(data) {
            var localData = data || {};
            var render = renderFunc || this._;
            var globalData = localData.$global;
            var out = createOut(globalData);
            out.sync();

            out.global.template = this;

            if (globalData) {
                localData.$global = undefined;
            }

            render(localData, out);
            return out.$__getResult();
        },

        /**
         * Renders a template to either a stream (if the last
         * argument is a Stream instance) or
         * provides the output to a callback function (if the last
         * argument is a Function).
         *
         * Supported signatures:
         *
         * render(data)
         * render(data, out)
         * render(data, stream)
         * render(data, callback)
         *
         * @param  {Object} data The view model data for the template
         * @param  {AsyncStream/AsyncVDOMBuilder} out A Stream, an AsyncStream/AsyncVDOMBuilder instance, or a callback function
         * @return {AsyncStream/AsyncVDOMBuilder} Returns the AsyncStream/AsyncVDOMBuilder instance that the template is rendered to
         */
        render: function(data, out) {
            var callback;
            var finalOut;
            var finalData;
            var globalData;
            var render = renderFunc || this._;
            var shouldBuffer = this.$__shouldBuffer;
            var shouldEnd = true;

            if (data) {
                finalData = data;
                if ((globalData = data.$global)) {
                    finalData.$global = undefined;
                }
            } else {
                finalData = {};
            }

            if (out && out.$__isOut) {
                finalOut = out;
                shouldEnd = false;
                extend(out.global, globalData);
            } else if (typeof out == 'function') {
                finalOut = createOut(globalData);
                callback = out;
            } else {
                finalOut = createOut(
                    globalData, // global
                    out, // writer(AsyncStream) or parentNode(AsyncVDOMBuilder)
                    null, // state
                    shouldBuffer // ignored by AsyncVDOMBuilder
                );
            }

            if (callback) {
                finalOut
                    .on('finish', function() {
                        callback(null, finalOut.$__getResult());
                    })
                    .once('error', callback);
            }

            globalData = finalOut.global;

            globalData.template = globalData.template || this;

            return safeRender(render, finalData, finalOut, shouldEnd);
        }
    });
};

});
$_mod.def("/marko$4.1.3/runtime/vdom/index", function(require, exports, module, __filename, __dirname) { 'use strict';
// helpers provide a core set of various utility methods
// that are available in every template
var AsyncVDOMBuilder = require('/marko$4.1.3/runtime/vdom/AsyncVDOMBuilder'/*'./AsyncVDOMBuilder'*/);
var makeRenderable = require('/marko$4.1.3/runtime/renderable'/*'../renderable'*/);

/**
 * Method is for internal usage only. This method
 * is invoked by code in a compiled Marko template and
 * it is used to create a new Template instance.
 * @private
 */
exports.t = function createTemplate(path) {
     return new Template(path);
};

function Template(path, func) {
    this.path = path;
    this._ = func;
    this.meta = undefined;
}

function createOut(globalData, parent, state) {
    return new AsyncVDOMBuilder(globalData, parent, state);
}

var Template_prototype = Template.prototype = {
    createOut: createOut
};

makeRenderable(Template_prototype);

exports.Template = Template;
exports.$__createOut = createOut;

require('/marko$4.1.3/runtime/createOut'/*'../createOut'*/).$__setCreateOut(createOut);

});
$_mod.def("/marko$4.1.3/vdom", function(require, exports, module, __filename, __dirname) { module.exports = require('/marko$4.1.3/runtime/vdom/index'/*'./runtime/vdom'*/);
});
$_mod.main("/marko$4.1.3/components", "");
$_mod.remap("/marko$4.1.3/components/index", "/marko$4.1.3/components/index-browser");
$_mod.def("/marko$4.1.3/components/ComponentsContext", function(require, exports, module, __filename, __dirname) { 'use strict';

var ComponentDef = require('/marko$4.1.3/components/ComponentDef'/*'./ComponentDef'*/);
var initComponents = require('/marko$4.1.3/components/init-components-browser'/*'./init-components'*/);
var EMPTY_OBJECT = {};

function ComponentsContext(out, root) {
    if (!root) {
        root = new ComponentDef(null, null, out);
    }

    this.$__out = out;
    this.$__componentStack = [root];
    this.$__preserved = EMPTY_OBJECT;
    this.$__componentsById = {};
}

ComponentsContext.prototype = {
    get $__components() {
        return this.$__componentStack[0].$__children;
    },

    $__beginComponent: function(component) {
        var self = this;
        var componentStack = self.$__componentStack;
        var origLength = componentStack.length;
        var parent = componentStack[origLength - 1];

        var componentId = component.id;

        if (!componentId) {
            componentId = component.id = parent.$__nextId();
        }

        var componentDef = new ComponentDef(component, componentId, this.$__out, componentStack, origLength);
        this.$__componentsById[componentId] = componentDef;
        parent.$__addChild(componentDef);
        componentStack.push(componentDef);

        return componentDef;
    },
    $__clearComponents: function () {
        this.$__componentStack = [new ComponentDef(null /* id */, this.$__out)];
    },
    $__initComponents: function (doc) {
        var componentDefs = this.$__components;
        if (componentDefs) {
            initComponents.$__initClientRendered(componentDefs, doc);
            this.$__clearComponents();
        }
    },
    $__nextComponentId: function() {
        var componentStack = this.$__componentStack;
        var parent = componentStack[componentStack.length - 1];
        return parent.$__nextId();
    },
    $__preserveDOMNode: function(elId, bodyOnly) {
        var preserved = this.$__preserved;
        if (preserved == EMPTY_OBJECT) {
            preserved = this.$__preserved = {};
        }
        preserved[elId] = { $__bodyOnly: bodyOnly };
    }
};

ComponentsContext.$__getComponentsContext = function (out) {
    var global = out.global;

    return out.data.components ||
        global.components ||
        (global.components = new ComponentsContext(out));
};

module.exports = ComponentsContext;

});
$_mod.def("/marko$4.1.3/components/renderer", function(require, exports, module, __filename, __dirname) { var componentsUtil = require('/marko$4.1.3/components/util-browser'/*'./util'*/);
var componentLookup = componentsUtil.$__componentLookup;
var emitLifecycleEvent = componentsUtil.$__emitLifecycleEvent;
var nextRepeatedId = require('/marko$4.1.3/components/nextRepeatedId'/*'./nextRepeatedId'*/);
var repeatedRegExp = /\[\]$/;
var ComponentsContext = require('/marko$4.1.3/components/ComponentsContext'/*'./ComponentsContext'*/);
var registry = require('/marko$4.1.3/components/registry-browser'/*'./registry'*/);
var copyProps = require('/raptor-util$3.2.0/copyProps'/*'raptor-util/copyProps'*/);

var COMPONENT_BEGIN_ASYNC_ADDED_KEY = '$wa';

function resolveComponentKey(out, key, scope) {
    if (key[0] == '#') {
        return key.substring(1);
    } else {
        var resolvedId;

        if (repeatedRegExp.test(key)) {
            resolvedId = nextRepeatedId(out, scope, key);
        } else {
            resolvedId = scope + '-' + key;
        }

        return resolvedId;
    }
}

function preserveComponentEls(existingComponent, out, componentsContext) {
    var rootEls = existingComponent.$__getRootEls({});

    for (var elId in rootEls) {
        var el = rootEls[elId];

        // We put a placeholder element in the output stream to ensure that the existing
        // DOM node is matched up correctly when using morphdom.
        out.element(el.tagName, { id: elId });

        componentsContext.$__preserveDOMNode(elId); // Mark the element as being preserved (for morphdom)
    }

    existingComponent.$__reset(); // The component is no longer dirty so reset internal flags
    return true;
}

function handleBeginAsync(event) {
    var parentOut = event.parentOut;
    var asyncOut = event.out;
    var componentsContext = asyncOut.global.components;
    var componentStack;

    if (componentsContext && (componentStack = componentsContext.$__componentStack)) {
        // All of the components in this async block should be
        // initialized after the components in the parent. Therefore,
        // we will create a new ComponentsContext for the nested
        // async block and will create a new component stack where the current
        // component in the parent block is the only component in the nested
        // stack (to begin with). This will result in top-level components
        // of the async block being added as children of the component in the
        // parent block.
        var nestedComponentsContext = new ComponentsContext(asyncOut, componentStack[componentStack.length-1]);
        asyncOut.data.components = nestedComponentsContext;
    }
    asyncOut.$c = parentOut.$c;
}

function createRendererFunc(templateRenderFunc, componentProps, renderingLogic) {
    renderingLogic = renderingLogic || {};
    var onInput = renderingLogic.onInput;
    var typeName = componentProps.type;
    var roots = componentProps.roots;
    var assignedId = componentProps.id;
    var split = componentProps.split;

    return function renderer(input, out) {
        var outGlobal = out.global;

        if (!out.isSync()) {
            if (!outGlobal[COMPONENT_BEGIN_ASYNC_ADDED_KEY]) {
                outGlobal[COMPONENT_BEGIN_ASYNC_ADDED_KEY] = true;
                out.on('beginAsync', handleBeginAsync);
            }
        }

        var component = outGlobal.$w;
        var isRerender = component !== undefined;
        var id = assignedId;
        var isExisting;
        var customEvents;
        var scope;

        if (component) {
            id = component.id;
            isExisting = true;
            outGlobal.$w = null;
        } else {
            var componentArgs = out.$c;

            if (componentArgs) {
                out.$c = null;

                scope = componentArgs[0];

                if (scope) {
                    scope = scope.id;
                }

                var key = componentArgs[1];
                if (key != null) {
                    key = key.toString();
                }
                id = id || resolveComponentKey(out, key, scope);
                customEvents = componentArgs[2];
            }
        }

        var componentsContext = ComponentsContext.$__getComponentsContext(out);
        id = id || componentsContext.$__nextComponentId();

        if (registry.$__isServer) {
            component = registry.$__createComponent(
                renderingLogic,
                id,
                input,
                out,
                typeName,
                customEvents,
                scope);
            input = component.$__updatedInput;
            component.$__updatedInput = undefined; // We don't want $__updatedInput to be serialized to the browser
        } else {
            if (!component) {
                if (isRerender) {
                    // Look in in the DOM to see if a component with the same ID and type already exists.
                    component = componentLookup[id];
                    if (component && component.$__type !== typeName) {
                        component = undefined;
                    }
                }

                if (component) {
                    isExisting = true;
                } else {
                    isExisting = false;
                    // We need to create a new instance of the component
                    component = registry.$__createComponent(typeName, id);

                    if (split) {
                        split = false;

                        var renderingLogicProps = typeof renderingLogic == 'function' ?
                            renderingLogic.prototype :
                            renderingLogic;

                        copyProps(renderingLogicProps, component.constructor.prototype);
                    }
                }

                // Set this flag to prevent the component from being queued for update
                // based on the new input. The component is about to be rerendered
                // so we don't want to queue it up as a result of calling `setInput()`
                component.$__updateQueued = true;

                component.$__setCustomEvents(customEvents, scope);

                if (!isExisting) {
                    emitLifecycleEvent(component, 'create', input, out);
                }

                input = component.$__setInput(input, onInput, out);

                if (isExisting) {
                    if (!component.$__isDirty || !component.shouldUpdate(input, component.$__state)) {
                        preserveComponentEls(component, out, componentsContext);
                        return;
                    }
                }
            }

            emitLifecycleEvent(component, 'render', out);
        }

        var componentDef = componentsContext.$__beginComponent(component);
        componentDef.$__roots = roots;
        componentDef.$__isExisting = isExisting;

        // Render the template associated with the component using the final template
        // data that we constructed
        templateRenderFunc(input, out, componentDef, component, component.$__rawState);

        componentDef.$__end();
    };
}

module.exports = createRendererFunc;

// exports used by the legacy renderer
createRendererFunc.$__resolveComponentKey = resolveComponentKey;
createRendererFunc.$__preserveComponentEls = preserveComponentEls;
createRendererFunc.$__handleBeginAsync = handleBeginAsync;

});
$_mod.def("/marko$4.1.3/components/index-browser", function(require, exports, module, __filename, __dirname) { var events = require('/marko$4.1.3/runtime/events'/*'../runtime/events'*/);
var Component = require('/marko$4.1.3/components/Component'/*'./Component'*/);
var componentsUtil = require('/marko$4.1.3/components/util-browser'/*'./util'*/);

function onInitComponent(listener) {
    events.on('initComponent', listener);
}

exports.onInitComponent = onInitComponent;
exports.Component = Component;
exports.getComponentForEl = componentsUtil.$__getComponentForEl;
exports.init = require('/marko$4.1.3/components/init-components-browser'/*'./init-components'*/).$__initServerRendered;

exports.c = require('/marko$4.1.3/components/defineComponent'/*'./defineComponent'*/); // Referenced by compiled templates
exports.r = require('/marko$4.1.3/components/renderer'/*'./renderer'*/); // Referenced by compiled templates
exports.rc = require('/marko$4.1.3/components/registry-browser'/*'./registry'*/).$__register;  // Referenced by compiled templates

window.$__MARKO_COMPONENTS = exports; // Helpful when debugging... WARNING: DO NOT USE IN REAL CODE!
});
$_mod.installed("behealth$0.0.1", "raptor-pubsub", "1.0.5");
$_mod.main("/raptor-pubsub$1.0.5", "lib/index");
$_mod.builtin("events", "/events$1.1.1/events");
$_mod.def("/events$1.1.1/events", function(require, exports, module, __filename, __dirname) { // Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        // At least give some kind of context to the user
        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
        err.context = er;
        throw err;
      }
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

});
$_mod.def("/raptor-pubsub$1.0.5/lib/raptor-pubsub", function(require, exports, module, __filename, __dirname) { var EventEmitter = require('/events$1.1.1/events'/*'events'*/).EventEmitter;

var channels = {};

var globalChannel = new EventEmitter();

globalChannel.channel = function(name) {
    var channel;
    if (name) {
        channel = channels[name] || (channels[name] = new EventEmitter());
    } else {
        channel = new EventEmitter();
    }
    return channel;
};

globalChannel.removeChannel = function(name) {
    delete channels[name];
};

module.exports = globalChannel;

});
$_mod.def("/raptor-pubsub$1.0.5/lib/index", function(require, exports, module, __filename, __dirname) { var g = typeof window === 'undefined' ? global : window;
// Make this module a true singleton
module.exports = g.__RAPTOR_PUBSUB || (g.__RAPTOR_PUBSUB = require('/raptor-pubsub$1.0.5/lib/raptor-pubsub'/*'./raptor-pubsub'*/));
});
$_mod.def("/marko$4.1.3/runtime/helpers", function(require, exports, module, __filename, __dirname) { 'use strict';
var isArray = Array.isArray;

function isFunction(arg) {
    return typeof arg == 'function';
}

function classList(arg, classNames) {
    var len;

    if (arg) {
        if (typeof arg == 'string') {
            if (arg) {
                classNames.push(arg);
            }
        } else if (typeof (len = arg.length) == 'number') {
            for (var i=0; i<len; i++) {
                classList(arg[i], classNames);
            }
        } else if (typeof arg == 'object') {
            for (var name in arg) {
                if (arg.hasOwnProperty(name)) {
                    var value = arg[name];
                    if (value) {
                        classNames.push(name);
                    }
                }
            }
        }
    }
}

function createDeferredRenderer(handler) {
    function deferredRenderer(input, out) {
        deferredRenderer.renderer(input, out);
    }

    // This is the initial function that will do the rendering. We replace
    // the renderer with the actual renderer func on the first render
    deferredRenderer.renderer = function(input, out) {
        var rendererFunc = handler.renderer || handler._ || handler.render;
        if (!isFunction(rendererFunc)) {
            throw Error('Invalid renderer');
        }
        // Use the actual renderer from now on
        deferredRenderer.renderer = rendererFunc;
        rendererFunc(input, out);
    };

    return deferredRenderer;
}

function resolveRenderer(handler) {
    var renderer = handler.renderer || handler._;

    if (renderer) {
        return renderer;
    }

    if (isFunction(handler)) {
        return handler;
    }

    // If the user code has a circular function then the renderer function
    // may not be available on the module. Since we can't get a reference
    // to the actual renderer(input, out) function right now we lazily
    // try to get access to it later.
    return createDeferredRenderer(handler);
}

/**
 * Internal helper method to prevent null/undefined from being written out
 * when writing text that resolves to null/undefined
 * @private
 */
exports.s = function strHelper(str) {
    return (str == null) ? '' : str.toString();
};

/**
 * Internal helper method to handle loops without a status variable
 * @private
 */
exports.f = function forEachHelper(array, callback) {
    if (isArray(array)) {
        for (var i=0; i<array.length; i++) {
            callback(array[i]);
        }
    } else if (isFunction(array)) {
        // Also allow the first argument to be a custom iterator function
        array(callback);
    }
};

/**
 * Helper to load a custom tag
 */
exports.t = function loadTagHelper(renderer, targetProperty, isRepeated) {
    if (renderer) {
        renderer = resolveRenderer(renderer);
    }

    return renderer;
};

/**
 * classList(a, b, c, ...)
 * Joines a list of class names with spaces. Empty class names are omitted.
 *
 * classList('a', undefined, 'b') --> 'a b'
 *
 */
exports.cl = function classListHelper() {
    var classNames = [];
    classList(arguments, classNames);
    return classNames.join(' ');
};

});
$_mod.def("/marko$4.1.3/runtime/vdom/helpers", function(require, exports, module, __filename, __dirname) { 'use strict';

var vdom = require('/marko$4.1.3/runtime/vdom/vdom'/*'./vdom'*/);
var VElement = vdom.$__VElement;
var VText = vdom.$__VText;

var commonHelpers = require('/marko$4.1.3/runtime/helpers'/*'../helpers'*/);
var extend = require('/raptor-util$3.2.0/extend'/*'raptor-util/extend'*/);

var classList = commonHelpers.cl;

exports.e = function(tagName, attrs, childCount, constId) {
    return new VElement(tagName, attrs, childCount, constId);
};

exports.t = function(value) {
    return new VText(value);
};

exports.const = function(id) {
    var i=0;
    return function() {
        return id + (i++);
    };
};

/**
 * Internal helper method to handle the "class" attribute. The value can either
 * be a string, an array or an object. For example:
 *
 * ca('foo bar') ==> ' class="foo bar"'
 * ca({foo: true, bar: false, baz: true}) ==> ' class="foo baz"'
 * ca(['foo', 'bar']) ==> ' class="foo bar"'
 */
exports.ca = function(classNames) {
    if (!classNames) {
        return null;
    }

    if (typeof classNames === 'string') {
        return classNames;
    } else {
        return classList(classNames);
    }
};

extend(exports, commonHelpers);

});
$_mod.def("/behealth$0.0.1/views/components/div-col-login/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            messageType: '',
            messageBody: '',
            message: false,
            mode: 'login'
        };
    },
    hideModal: function (event) {
        pubsub.emit('hideModal', {});
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            mode: input.mode || 'default'
        };
    },
    doLogout: function (event) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/signin', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 205) {
                console.log('response', this.responseText);
                window.location.assign('/home');
            }
        };
        var sendData = JSON.stringify({ logout: true });
        console.log(sendData);
        xhr.send(sendData);
    },
    doLogin: function (event) {
        var state = this.state;
        var user = {
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
        };
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/signin', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 200) {
                state.message = true;
                state.messageType = 'success';
                state.messageBody = 'Login efetuado com sucesso, vamos ser #HEALTH hoje?';
                console.log('response', this.responseText);
                setTimeout(function () {
                    window.location.assign('/home');
                }, 2000);
            }
            if (this.status == 401) {
                state.message = true;
                state.messageType = 'error';
                state.messageBody = this.status + ' - ' + this.responseText;
            }
        };
        var sendData = JSON.stringify(user);
        console.log(sendData);
        xhr.send(sendData);
        this.emit('click', { event: event });
    },
    doRegister: function (event) {
        event.preventDefault();
        var user = {
            fullName: document.getElementById('fullnameR').value,
            email: document.getElementById('emailR').value,
            password: document.getElementById('passwordR').value,
            firstName: document.getElementById('fullnameR').value.split(' ')[0]
        };
        var state = this.state;
        console.log(user);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/signup', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            console.log(this.readyState, this.status);
            if (this.readyState != 4)
                return false;
            if (this.status == 201) {
                state.message = true;
                state.messageType = 'success';
                state.messageBody = 'Cadastro efetuado com sucesso, Parabéns por ser #HEALTH';
                setTimeout(function () {
                    window.location.assign('/home');
                }, 2000);
            }
            if (this.status == 401) {
                state.message = true;
                state.messageType = 'error';
                state.messageBody = this.status + ' - ' + this.responseText;
            }
        };
        xhr.send(JSON.stringify(user));
        this.emit('click', { event: event });
    },
    goto: function (destine) {
        this.state.mode = destine;
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-col-login/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_classAttr = marko_helpers.ca,
    marko_attrs0 = {
        id: "login"
      },
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("fefed2"),
    marko_node0 = marko_createElement("DIV", {
        "class": "text-center"
      }, 1, 0, marko_const_nextId())
      .e("IMG", {
          src: "img/logo_sticky.png",
          alt: "",
          "data-retina": "true"
        }, 0),
    marko_node1 = marko_createElement("HR", null, 0, 0, marko_const_nextId()),
    marko_node2 = marko_createElement("DIV", {
        "class": "form-group"
      }, 2, 0, marko_const_nextId())
      .e("LABEL", null, 1)
        .t("Email")
      .e("INPUT", {
          type: "text",
          "class": " form-control ",
          placeholder: "Email",
          id: "email"
        }, 0),
    marko_node3 = marko_createElement("DIV", {
        "class": "form-group"
      }, 2, 0, marko_const_nextId())
      .e("LABEL", null, 1)
        .t("Senha")
      .e("INPUT", {
          type: "password",
          "class": " form-control",
          placeholder: "Senha",
          id: "password"
        }, 0),
    marko_node4 = marko_createElement("P", {
        "class": "small"
      }, 1, 0, marko_const_nextId())
      .e("A", {
          href: "#"
        }, 1)
        .t("esqueceu sua senha?"),
    marko_node5 = marko_createElement("DIV", {
        "class": "form-group"
      }, 2, 0, marko_const_nextId())
      .e("LABEL", null, 1)
        .t("Nome completo")
      .e("INPUT", {
          type: "text",
          "class": "form-control",
          placeholder: "Nome completo",
          id: "fullnameR"
        }, 0),
    marko_node6 = marko_createElement("DIV", {
        "class": "form-group"
      }, 2, 0, marko_const_nextId())
      .e("LABEL", null, 1)
        .t("Email")
      .e("INPUT", {
          type: "email",
          "class": "form-control",
          placeholder: "Email",
          id: "emailR",
          autocomplete: "off"
        }, 0),
    marko_node7 = marko_createElement("DIV", {
        "class": "form-group"
      }, 2, 0, marko_const_nextId())
      .e("LABEL", null, 1)
        .t("Senha")
      .e("INPUT", {
          type: "password",
          "class": "form-control",
          id: "passwordR",
          placeholder: "Senha"
        }, 0);

function render(input, out, __component, component, state) {
  var data = input;

  out.be("DIV", {
      "class": marko_classAttr([
          input.className
        ]),
      id: __component.id
    }, null, 4);

  out.be("DIV", marko_attrs0);

  out.n(marko_node0);

  out.n(marko_node1);

  if (state.message) {
    out.e("DIV", {
        "class": marko_classAttr([
            "message",
            state.messageType
          ])
      }, 1, 4)
      .t(state.messageBody);
  }

  if (!out.global.currentUser) {
    out.be("FORM");

    if (state.mode == "login") {
      out.n(marko_node2);

      out.n(marko_node3);

      out.n(marko_node4);

      out.e("A", {
          href: "#",
          "class": "btn_full",
          "data-_onclick": __component.d("doLogin")
        }, 1)
        .t("Login");

      out.e("A", {
          href: "#",
          "class": "btn_full_outline",
          "data-_onclick": __component.d("goto", [
              "register"
            ])
        }, 1)
        .t("Cadastrar");
    } else {
      out.n(marko_node5);

      out.n(marko_node6);

      out.n(marko_node7);

      out.e("BUTTON", {
          "class": "btn_full",
          "data-_onclick": __component.d("doRegister")
        }, 1, 4)
        .t("Registrar");

      out.e("A", {
          href: "#",
          "class": "btn_full_outline",
          "data-_onclick": __component.d("goto", [
              "login"
            ])
        }, 1)
        .t("Logar");
    }

    out.ee();
  } else {
    out.e("A", {
        href: "#",
        "class": "btn_full",
        "data-_onclick": __component.d("doLogout")
      }, 1)
      .t("Logout");
  }

  if (input.mode == "modal") {
    out.e("A", {
        href: "#",
        "class": "close-link",
        "data-_onclick": __component.d("hideModal")
      }, 1)
      .t("fechar");
  }

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/div-col-preorder/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            messageType: '',
            messageBody: '',
            message: false,
            mode: 'login',
            thisid: input.thisid
        };
        if (input.email) {
            var data = {
                email: input.email,
                preorder: this.state.thisid
            };
            this.sendPreOrder(data);
        }
    },
    hideModal: function (event) {
        pubsub.emit('hideModal', {});
    },
    onInput: function (input) {
        console.log(input);
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            mode: input.mode || 'default',
            thisid: input.thisid || '',
            email: input.email || ''
        };
    },
    sendPreOrder: function (data) {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/order/' + data.preorder, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            console.log(this.readyState, this.status);
            if (this.readyState != 4)
                return false;
            if (this.status == 200) {
                self.state.message = true;
                self.state.messageType = 'success';
                self.state.messageBody = 'Recebemos seus dados, parabéns por ser #HEALTH';
                setTimeout(function () {
                    window.location.assign('/home');
                }, 2000);
            }
        };
        xhr.send(JSON.stringify(data));
    },
    getPreOrder: function (event) {
        var self = this;
        event.preventDefault();
        var data = {
            email: document.getElementById('email2').value,
            preorder: this.state.thisid
        };
        this.sendPreOrder(data);
        console.log(data);
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-col-preorder/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_classAttr = marko_helpers.ca,
    marko_attrs0 = {
        id: "login"
      },
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("0619a8"),
    marko_node0 = marko_createElement("DIV", {
        "class": "text-center"
      }, 1, 0, marko_const_nextId())
      .e("IMG", {
          src: "img/logo_sticky.png",
          alt: "",
          "data-retina": "true"
        }, 0),
    marko_node1 = marko_createElement("HR", null, 0, 0, marko_const_nextId()),
    marko_node2 = marko_createElement("STRONG", {
        style: "text-align:center;"
      }, 1, 0, marko_const_nextId())
      .t("Ótimo agora só precisamos do seu email para enviar o seu orçamento."),
    marko_attrs1 = {
        style: "text-align:center;"
      },
    marko_node3 = marko_createElement("DIV", {
        "class": "form-group"
      }, 2, 0, marko_const_nextId())
      .e("LABEL", null, 1)
        .t("Email")
      .e("INPUT", {
          type: "text",
          "class": " form-control ",
          placeholder: "Email",
          id: "email2"
        }, 0);

function render(input, out, __component, component, state) {
  var data = input;

  out.be("DIV", {
      "class": marko_classAttr([
          input.className
        ]),
      id: __component.id
    }, null, 4);

  out.be("DIV", marko_attrs0);

  out.n(marko_node0);

  out.n(marko_node1);

  if (!input.email) {
    out.n(marko_node2);
  } else {
    out.e("STRONG", marko_attrs1, 2)
      .t("Estamos enviando um orçamento para o seu email ")
      .t(input.email);
  }

  if (state.message) {
    out.e("DIV", {
        "class": marko_classAttr([
            "message",
            state.messageType
          ])
      }, 1, 4)
      .t(state.messageBody);
  }

  if (!input.email) {
    out.e("FORM", null, 2)
      .n(marko_node3)
      .e("A", {
          href: "#",
          "class": "btn_full_outline",
          "data-_onclick": __component.d("getPreOrder")
        }, 1)
        .t("Receber orçamento");
  }

  out.e("A", {
      href: "#",
      "class": "close-link",
      "data-_onclick": __component.d("hideModal")
    }, 1)
    .t("fechar");

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.main("/behealth$0.0.1/views/components/div-col-login", "index.marko");
$_mod.main("/behealth$0.0.1/views/components/div-col-preorder", "index.marko");
$_mod.def("/behealth$0.0.1/views/components/div-backdrop-modal/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            visible: false,
            classe: 'placeholder',
            type: '',
            thisid: ''
        };
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            email: input.email || ''
        };
    },
    onMount: function () {
        var self = this;
        pubsub.on('showModal', function (data) {
            console.log('show modal', data);
            self.state.classe = 'show-modal';
            self.state.type = data.type;
            self.state.thisid = data.thisid;
        });
        pubsub.on('hideModal', function () {
            console.log('hide modal', self);
            self.state.classe = 'hide-modal';
        });
    },
    close: function () {
        pubsub.emit('hideModal', {});
    },
    show: function (boo) {
        if (boo) {
            return 'show-modal';
        }
        return 'hide-modal';
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-backdrop-modal/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    div_col_login_template = require('/behealth$0.0.1/views/components/div-col-login/index.marko'/*"../div-col-login"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_loadTag = marko_helpers.t,
    div_col_login_tag = marko_loadTag(div_col_login_template),
    div_col_preorder_template = require('/behealth$0.0.1/views/components/div-col-preorder/index.marko'/*"../div-col-preorder"*/),
    div_col_preorder_tag = marko_loadTag(div_col_preorder_template),
    marko_classAttr = marko_helpers.ca;

function render(input, out, __component, component, state) {
  var data = input;

  out.be("DIV", {
      "class": marko_classAttr([
          "backdrop",
          state.classe
        ]),
      id: __component.id
    }, null, 4);

  console.log('user in modal -> ',out.global.currentUser)

  if (!state.type) {
    div_col_login_tag({
        "class": "col-md-4 col-md-offset-4 col-sm-6 col-sm-offset-3",
        mode: "modal"
      }, out);
  }

  if (state.type == "preorder") {
    div_col_preorder_tag({
        "class": "col-md-4 col-md-offset-4 col-sm-6 col-sm-offset-3",
        mode: "modal",
        thisid: state.thisid,
        email: input.email
      }, out);
  }

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/app-number-spinner/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    getInitialState: function (input) {
        console.log('initialstate');
        return {
            name: input.name,
            selected: input.selected || false
        };
    },
    onInput: function (input) {
        var value = input.value || 0;
        var index = input.index || 0;
        this.state = {
            value: value,
            index: index
        };
        console.log(input.index);
    },
    handleIncrementClick: function (delta) {
        if (this.state.value + delta >= 0) {
            this.state.value += delta;
            var value = this.state.value;
            var data = {
                target: this.state.index,
                value: value
            };
            pubsub.emit('setQtd', data);
        }
    },
    handleInputKeyUp: function (event, el) {
        var newValue = el.value;
        if (/^-?[0-9]+$/.test(newValue)) {
            this.state.value = parseInt(newValue, 10);
            var value = this.state.value;
            var data = {
                target: this.state.index,
                value: value
            };
            pubsub.emit('setQtd', data);
        }
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/app-number-spinner/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_classAttr = marko_helpers.ca;

void 0/*require("./style.css")*/;

function getClassNameForValue(value) {
    if (value < 0) {
        return 'negative'
    } else if (value > 0) {
        return 'positive'
    }
};

function render(input, out, __component, component, state) {
  var data = input;

  var value=state.value;

  out.e("DIV", {
      "class": marko_classAttr([
          "number-spinner",
          getClassNameForValue(value)
        ]),
      id: __component.id
    }, 1, 4)
    .e("INPUT", {
        type: "text",
        value: state.value,
        size: "4",
        "data-_onkeyup": __component.d("handleInputKeyUp")
      }, 0);
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/marko$4.1.3/runtime/helper-forEachProperty", function(require, exports, module, __filename, __dirname) { var isArray = Array.isArray;

/**
 * Internal helper method for looping over the properties of any object
 * @private
 */
module.exports = function forEachPropertyHelper(o, func) {
    if (!o) {
        return;
    }

    if (isArray(o)) {
        for (var i=0; i<o.length; i++) {
            func(i, o[i]);
        }
    } else if (typeof Map && o instanceof Map) {
        o.forEach(function(v, k) {
            func(k, v);
        });
    } else {
        for (var k in o) {
            if (o.hasOwnProperty(k)) {
                func(k, o[k]);
            }
        }
    }
};
});
$_mod.main("/behealth$0.0.1/views/components/app-number-spinner", "index.marko");
$_mod.def("/behealth$0.0.1/views/components/div-cart/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            cart: [],
            frete: 0,
            total: 0,
            id: ''
        };
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class'],
            mode: input.mode || '',
            frete: input.frete || 0,
            total: input.total || 0,
            cart: input.cart || []
        };
    },
    onMount: function () {
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://behealthbrasil.com.br/api/order/cart', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return false;
            if (this.status == 200) {
                console.log('return from GET MOUNT', this);
                if (this.responseText != 'OK' && this.responseText != '{}') {
                    var order = JSON.parse(this.responseText);
                    if (!Array.isArray(order)) {
                        self.state.cart = order.cart;
                        self.state.id = order.id;
                        var newTotal = 0;
                        self.state.cart.forEach(function (item) {
                            newTotal += item.qtd * item.price;
                        });
                        self.state.total = newTotal;
                        self.setStateDirty('total');
                    }
                }
            }
        };
        xhr.send();
        pubsub.on('setQtd', function (data) {
            if (self.input.mode == 'page') {
                self.state.cart[data.target].qtd = data.value;
                var total = 0;
                console.log(self.state.cart);
                for (var i = 0; i < self.state.cart.length; i++) {
                    console.log('item', self.state.cart[i]);
                    if (self.state.cart[i].label != 'Formula não Listada') {
                        total += self.state.cart[i].qtd * self.state.cart[i].price;
                        console.log('total', total);
                    }
                }
                self.state.total = total;
                self.setStateDirty('total');
            }
        });
        if (this.input.mode == 'summary') {
            pubsub.on('onSendPayment', function () {
                var data = {
                    amount: self.state.total,
                    id: self.state.id
                };
                console.log('sending payment', data);
                $.ajax({
                    url: 'https://behealthbrasil.com.br/api/pay2',
                    type: 'POST',
                    data: JSON.stringify(data),
                    processData: false,
                    contentType: 'application/json',
                    success: function (data) {
                        console.info('files', data);
                        window.location.assign(data);
                    }
                });
            });
        }
        pubsub.on('onAddCartItem', function (data) {
            self.state.cart.push(data.item);
            self.setStateDirty('cart');
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://behealthbrasil.com.br/api/order/cart', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = function () {
                if (this.readyState != 4)
                    return false;
                if (this.status == 200) {
                    console.log('return from GET', this.responseText);
                    self.state.cart = JSON.parse(this.responseText).cart;
                    self.state.id = JSON.parse(this.responseText).id;
                    var newTotal = 0;
                    if (self.state.cart && self.state.cart.length > 0) {
                        self.state.cart.forEach(function (item) {
                            newTotal += item.qtd * item.price;
                        });
                    }
                    self.state.total = newTotal;
                    self.setStateDirty('total');
                }
            };
            var data = { cart: self.state.cart };
            xhr.send(JSON.stringify(data));
        });
        pubsub.on('onRemoveCartItem', function (index) {
            self.state.cart.splice(index, 1);
            self.setStateDirty('cart');
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://behealthbrasil.com.br/api/order/cart', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = function () {
                if (this.readyState != 4)
                    return false;
                if (this.status == 200) {
                    console.log('return from GET', this.responseText);
                    self.state.cart = JSON.parse(this.responseText).cart;
                    self.state.id = JSON.parse(this.responseText).id;
                    var newTotal = 0;
                    if (self.state.cart && self.state.cart.length > 0) {
                        self.state.cart.forEach(function (item) {
                            newTotal += item.qtd * item.price;
                        });
                    }
                    self.state.total = newTotal;
                    self.setStateDirty('total');
                }
            };
            var data = { cart: self.state.cart };
            xhr.send(JSON.stringify(data));
        });
        Number.prototype.formatMoney = function (c, d, t) {
            var n = this, c = isNaN(c = Math.abs(c)) ? 2 : c, d = d == undefined ? '.' : d, t = t == undefined ? ',' : t, s = n < 0 ? '-' : '', i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), j = (j = i.length) > 3 ? j % 3 : 0;
            return s + (j ? i.substr(0, j) + t : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, '$1' + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : '');
        };
    },
    remove: function (index) {
        pubsub.emit('onRemoveCartItem', index);
    },
    handleClick: function (event) {
        this.emit('click', { event: event });
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-cart/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    marko_forEachProp = require('/marko$4.1.3/runtime/helper-forEachProperty'/*"marko/runtime/helper-forEachProperty"*/),
    app_number_spinner_template = require('/behealth$0.0.1/views/components/app-number-spinner/index.marko'/*"../app-number-spinner"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_loadTag = marko_helpers.t,
    app_number_spinner_tag = marko_loadTag(app_number_spinner_template),
    marko_attrs0 = {
        "class": "dropdown dropdown-cart"
      },
    marko_attrs1 = {
        href: "#",
        "class": "dropdown-toggle",
        "data-toggle": "dropdown"
      },
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("3d417a"),
    marko_node0 = marko_createElement("I", {
        "class": " icon-basket-1"
      }, 0, 0, marko_const_nextId()),
    marko_attrs2 = {
        "class": "dropdown-menu",
        id: "cart_items"
      },
    marko_attrs3 = {
        "class": "image",
        style: "width:90px;"
      },
    marko_attrs4 = {
        style: "width:110px;"
      },
    marko_attrs5 = {
        href: "#",
        "class": "action"
      },
    marko_attrs6 = {
        href: "#"
      },
    marko_node1 = marko_createElement("A", {
        href: "/cart",
        "class": "button_drop"
      }, 1, 0, marko_const_nextId())
      .t("Ver carrinho"),
    marko_attrs7 = {
        "class": "table table-striped cart-list add_bottom_30"
      },
    marko_node2 = marko_createElement("THEAD", null, 1, 0, marko_const_nextId())
      .e("TR", null, 5)
        .e("TH", null, 1)
          .t("Item")
        .e("TH", null, 1)
          .t("Quantidde")
        .e("TH", null, 1)
          .t("Preço unitário")
        .e("TH", null, 1)
          .t("Total")
        .e("TH", null, 0),
    marko_node3 = marko_createElement("TD", {
        "class": "options"
      }, 2, 0, marko_const_nextId())
      .e("A", {
          href: "#"
        }, 1)
        .e("I", {
            "class": " icon-trash"
          }, 0)
      .e("A", {
          href: "#"
        }, 1)
        .e("I", {
            "class": "icon-ccw-2"
          }, 0),
    marko_attrs8 = {
        "class": "price-value"
      },
    marko_node4 = marko_createElement("SPAN", {
        "class": "mo"
      }, 1, 0, marko_const_nextId())
      .t(" o melhor preço "),
    marko_attrs9 = {
        "class": "table table_summary"
      },
    marko_attrs10 = {
        "class": "total"
      },
    marko_node5 = marko_createElement("TD", null, 1, 0, marko_const_nextId())
      .t("Pedido"),
    marko_attrs11 = {
        "class": "text-right"
      },
    marko_node6 = marko_createElement("TD", null, 1, 0, marko_const_nextId())
      .t("Frete"),
    marko_attrs12 = {
        "class": "text-right"
      },
    marko_node7 = marko_createElement("TD", null, 1, 0, marko_const_nextId())
      .t("Total"),
    marko_attrs13 = {
        "class": "text-right"
      };

function render(input, out, __component, component, state) {
  var data = input;

  out.be("DIV", {
      id: __component.id
    }, null, 4);

  if (input.mode == "dropdown") {
    out.be("DIV", marko_attrs0);

    out.be("A", marko_attrs1);

    out.n(marko_node0);

    out.t(" Cart ");

    if ((state.cart != "undefined") && (state.cart != null)) {
      out.t("(");

      out.t(state.cart.length);

      out.t(")");
    }

    out.ee();

    if (((state.cart != "undefined") && (state.cart != null)) && (state.cart.length > 0)) {
      out.be("UL", marko_attrs2);

      marko_forEachProp(state.cart, function(i, item) {
        out.e("LI", null, 3)
          .e("DIV", marko_attrs3, 1)
            .t(item.label)
          .e("STRONG", marko_attrs4, 8)
            .e("A", marko_attrs6, 3)
              .t("R$ ")
              .t((item.qtd * item.price).formatMoney(2, ",", "."))
              .t(" ")
            .t(" por ")
            .t(item.qtd)
            .t(" ")
            .t(item.unid)
            .t(" x R$ ")
            .t(item.price.formatMoney(2, ",", "."))
            .t(" ")
          .e("A", marko_attrs5, 1)
            .e("I", {
                "class": "icon-trash",
                "data-_onclick": __component.d("remove", [
                    i
                  ])
              }, 0, 4);
      });

      out.e("LI", null, 2)
        .e("DIV", null, 2)
          .t("Total: ")
          .e("SPAN", null, 2)
            .t("R$ ")
            .t(state.total.formatMoney(2, ",", "."))
        .n(marko_node1);

      out.ee();
    }

    out.ee();
  }

  if (input.mode == "page") {
    out.be("TABLE", marko_attrs7);

    out.n(marko_node2);

    out.be("TBODY");

    marko_forEachProp(state.cart, function(i, item) {
      out.be("TR");

      out.e("TD", null, 1)
        .t(item.label);

      out.be("TD");

      app_number_spinner_tag({
          value: item.qtd,
          index: i
        }, out);

      out.t(" x ");

      out.t(item.unidade);

      out.ee();

      out.e("TD", null, 1)
        .t(item.price.formatMoney(2, ",", "."));

      out.e("TD", null, 1)
        .e("STRONG", null, 2)
          .t("R$ ")
          .t((item.price * item.qtd).formatMoney(2, ",", "."));

      out.n(marko_node3);

      out.ee();
    });

    out.ee();

    out.ee();

    out.e("DIV", null, 2)
      .e("SPAN", marko_attrs8, 2)
        .t("R$ ")
        .t(state.total.formatMoney(2, ",", "."))
      .n(marko_node4);
  }

  if (input.mode == "summary") {
    out.e("TABLE", marko_attrs9, 1)
      .e("TBODY", null, 3)
        .e("TR", null, 2)
          .n(marko_node5)
          .e("TD", marko_attrs11, 2)
            .t("R$ ")
            .t(state.total.formatMoney(2, ",", "."))
        .e("TR", null, 2)
          .n(marko_node6)
          .e("TD", marko_attrs12, 2)
            .t("R$ ")
            .t(state.frete.formatMoney(2, ",", "."))
        .e("TR", marko_attrs10, 2)
          .n(marko_node7)
          .e("TD", marko_attrs13, 2)
            .t("R$ ")
            .t((state.total + state.frete).formatMoney(2, ",", "."));
  }

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.main("/behealth$0.0.1/views/components/div-cart", "index.marko");
$_mod.def("/behealth$0.0.1/views/components/comp-menu/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = {
        onCreate: function(input) {},
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          console.log("click!");

          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/comp-menu/index.marko", function() {
      return module.exports;
    }),
    div_cart_template = require('/behealth$0.0.1/views/components/div-cart/index.marko'/*"../div-cart"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_loadTag = marko_helpers.t,
    div_cart_tag = marko_loadTag(div_cart_template),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("45cedd"),
    marko_node0 = marko_createElement("A", {
        "class": "cmn-toggle-switch cmn-toggle-switch__htx open_close",
        href: "javascript:void(0);"
      }, 1, 0, marko_const_nextId())
      .e("SPAN", null, 1)
        .t("Menu mobile"),
    marko_node1 = marko_createElement("DIV", {
        "class": "main-menu"
      }, 3, 0, marko_const_nextId())
      .e("DIV", {
          id: "header_menu"
        }, 1)
        .e("A", {
            href: "/home",
            style: "text-decoration:none;"
          }, 1)
          .e("IMG", {
              src: "img/logo_sticky.png",
              width: "160",
              height: "34",
              alt: "City tours",
              "data-retina": "true"
            }, 0)
      .e("A", {
          href: "#",
          "class": "open_close",
          id: "close_in"
        }, 1)
        .e("I", {
            "class": "icon_set_1_icon-77"
          }, 0)
      .e("UL", null, 0),
    marko_attrs0 = {
        id: "top_tools"
      },
    marko_node2 = marko_createElement("LI", null, 1, 0, marko_const_nextId())
      .e("DIV", {
          "class": "dropdown dropdown-search"
        }, 2)
        .e("A", {
            href: "#",
            "class": "dropdown-toggle",
            "data-toggle": "dropdown"
          }, 1)
          .e("I", {
              "class": "icon-search"
            }, 0)
        .e("DIV", {
            "class": "dropdown-menu"
          }, 1)
          .e("FORM", null, 1)
            .e("DIV", {
                "class": "input-group"
              }, 2)
              .e("INPUT", {
                  type: "text",
                  "class": "form-control",
                  placeholder: "Search..."
                }, 0)
              .e("SPAN", {
                  "class": "input-group-btn"
                }, 1)
                .e("BUTTON", {
                    "class": "btn btn-default",
                    type: "button",
                    style: "margin-left:0;"
                  }, 1)
                  .e("I", {
                      "class": "icon-search"
                    }, 0);

function isActive(link,actual) {
	//console.log(link,actual);

		if(link == actual){
			return 'active';
		}

		return 'not-active';
	};

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.be("NAV", {
      "class": "col-md-7 col-sm-9 col-xs-9",
      id: __component.id
    }, null, 4);

  out.n(marko_node0);

  out.n(marko_node1);

  out.be("UL", marko_attrs0);

  out.n(marko_node2);

  out.be("LI");

  div_cart_tag({
      mode: "dropdown"
    }, out);

  out.ee();

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.main("/behealth$0.0.1/views/components/comp-menu", "index.marko");
$_mod.def("/behealth$0.0.1/views/components/layout-header/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    onCreate: function (input) {
    },
    onInput: function (input) {
    },
    callModalLogin: function (event) {
        pubsub.emit('showModal', {});
    },
    doLogout: function (event) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/signin', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 205) {
                console.log('response', this.responseText);
                window.location.assign('/home');
            }
        };
        var sendData = JSON.stringify({ logout: true });
        console.log(sendData);
        xhr.send(sendData);
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/layout-header/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    comp_menu_template = require('/behealth$0.0.1/views/components/comp-menu/index.marko'/*"../comp-menu"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_loadTag = marko_helpers.t,
    comp_menu_tag = marko_loadTag(comp_menu_template),
    marko_attrs0 = {
        id: "top_line"
      },
    marko_attrs1 = {
        "class": "container"
      },
    marko_attrs2 = {
        "class": "row"
      },
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("c1aba2"),
    marko_node0 = marko_createElement("DIV", {
        "class": "col-md-6 col-sm-6 col-xs-12"
      }, 0, 0, marko_const_nextId()),
    marko_attrs3 = {
        "class": "col-md-6 col-sm-6 col-xs-12"
      },
    marko_attrs4 = {
        id: "top_links"
      },
    marko_attrs5 = {
        "class": "container"
      },
    marko_attrs6 = {
        "class": "row"
      },
    marko_node1 = marko_createElement("DIV", {
        "class": "col-md-5 col-sm-3 col-xs-3"
      }, 1, 0, marko_const_nextId())
      .e("DIV", {
          id: "logo"
        }, 2)
        .e("A", {
            href: "/home"
          }, 1)
          .e("IMG", {
              src: "img/logo_white.png",
              width: "160",
              height: "34",
              alt: "City tours",
              "data-retina": "true",
              "class": "logo_normal"
            }, 0)
        .e("A", {
            href: "/home"
          }, 1)
          .e("IMG", {
              src: "img/logo_sticky.png",
              width: "160",
              height: "34",
              alt: "City tours",
              "data-retina": "true",
              "class": "logo_sticky"
            }, 0),
    marko_node2 = marko_createElement("STRONG", null, 1, 0, marko_const_nextId())
      .t("faça seu login!"),
    marko_attrs7 = {
        href: "/profile"
      };

function render(input, out, __component, component, state) {
  var data = input;

  out.be("HEADER", {
      id: __component.id
    }, null, 4);

  out.be("DIV", marko_attrs0);

  out.be("DIV", marko_attrs1);

  out.be("DIV", marko_attrs2);

  out.n(marko_node0);

  out.be("DIV", marko_attrs3);

  out.be("UL", marko_attrs4);

  if (!out.global.currentUser) {
    out.e("LI", null, 1)
      .e("A", {
          href: "#",
          "data-_onclick": __component.d("callModalLogin", [
              {
                  data: "valor"
                }
            ])
        }, 2)
        .t("Olá, ")
        .n(marko_node2);
  } else {
    out.e("LI", null, 3)
      .t("Olá ")
      .e("STRONG", null, 1)
        .e("A", marko_attrs7, 1)
          .t(out.global.currentUser.firstName)
      .t(", parabéns por ser #health");
  }

  if (out.global.currentUser) {
    out.e("LI", null, 1)
      .e("A", {
          href: "#",
          "data-_onclick": __component.d("doLogout")
        }, 1)
        .t("Logout");
  }

  out.ee();

  out.ee();

  out.ee();

  out.ee();

  out.ee();

  out.be("DIV", marko_attrs5);

  out.be("DIV", marko_attrs6);

  out.n(marko_node1);

  comp_menu_tag({}, out);

  out.ee();

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/layout-footer/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = {
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/layout-footer/index.marko", function() {
      return module.exports;
    }),
    marko_attrs0 = {
        "class": "container"
      },
    marko_attrs1 = {
        "class": "row"
      },
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("bd8486"),
    marko_node0 = marko_createElement("DIV", {
        "class": "col-md-5 col-sm-4"
      }, 4, 0, marko_const_nextId())
      .e("H3", null, 1)
        .t("Precisa de ajuda?")
      .e("A", {
          href: "mailto:ajuda@behealthbrasil.com.br",
          id: "email_footer"
        }, 1)
        .t("ajuda@behealthbrasil.com.br")
      .e("STRONG", null, 1)
        .t("Pague com")
      .e("P", null, 1)
        .e("IMG", {
            src: "img/payments.png",
            width: "231",
            height: "30",
            alt: "Image",
            "data-retina": "true",
            "class": "img-responsive"
          }, 0),
    marko_attrs2 = {
        "class": "col-md-3 col-sm-4"
      },
    marko_node1 = marko_createElement("H3", null, 1, 0, marko_const_nextId())
      .t("Sobre"),
    marko_node2 = marko_createElement("LI", null, 1, 0, marko_const_nextId())
      .e("A", {
          href: "/quemsomos"
        }, 1)
        .t("Quem somos"),
    marko_node3 = marko_createElement("LI", null, 1, 0, marko_const_nextId())
      .e("A", {
          href: "https://blog.behealthbrasil.com.br"
        }, 1)
        .t("BLOG"),
    marko_node4 = marko_createElement("LI", null, 1, 0, marko_const_nextId())
      .e("A", {
          href: "/faq"
        }, 1)
        .t("FAQ"),
    marko_node5 = marko_createElement("LI", null, 1, 0, marko_const_nextId())
      .e("A", {
          href: "/termos"
        }, 1)
        .t("Termos e condições"),
    marko_node6 = marko_createElement("DIV", {
        "class": "col-md-3 col-sm-4",
        id: "newsletter"
      }, 4, 0, marko_const_nextId())
      .e("H3", null, 1)
        .t("Newsletter")
      .e("P", null, 1)
        .t("Fique por dentro das nossas novidades.")
      .e("DIV", {
          id: "message-newsletter_2"
        }, 0)
      .e("FORM", {
          method: "post",
          action: "assets/newsletter.php",
          name: "newsletter_2",
          id: "newsletter_2"
        }, 2)
        .e("DIV", {
            "class": "form-group"
          }, 1)
          .e("INPUT", {
              name: "email_newsletter_2",
              id: "email_newsletter_2",
              type: "email",
              value: "",
              placeholder: "Seu email",
              "class": "form-control"
            }, 0)
        .e("INPUT", {
            type: "submit",
            value: "Assinar",
            "class": "btn_1",
            id: "submit-newsletter_2"
          }, 0),
    marko_node7 = marko_createElement("DIV", {
        "class": "row"
      }, 1, 0, marko_const_nextId())
      .e("DIV", {
          "class": "col-md-12"
        }, 1)
        .e("DIV", {
            id: "social_footer"
          }, 2)
          .e("UL", null, 2)
            .e("LI", null, 1)
              .e("A", {
                  href: "https://www.facebook.com/behealthbrasil/",
                  target: "_blank"
                }, 1)
                .e("I", {
                    "class": "icon-facebook"
                  }, 0)
            .e("LI", null, 1)
              .e("A", {
                  href: "https://www.instagram.com/behealthbr/",
                  target: "_blank"
                }, 1)
                .e("I", {
                    "class": "icon-instagram"
                  }, 0)
          .e("P", null, 1)
            .t("© Behealth 2017"),
    marko_node8 = marko_createElement("LI", null, 1, 0, marko_const_nextId())
      .e("A", {
          href: "/login"
        }, 1)
        .t("Login"),
    marko_node9 = marko_createElement("LI", null, 1, 0, marko_const_nextId())
      .e("A", {
          href: "/register"
        }, 1)
        .t("Cadastro");

function render(input, out, __component, component, state) {
  var data = input;

  out.be("FOOTER", {
      id: __component.id
    }, null, 4);

  out.be("DIV", marko_attrs0);

  out.be("DIV", marko_attrs1);

  out.n(marko_node0);

  out.be("DIV", marko_attrs2);

  out.n(marko_node1);

  out.be("UL");

  out.n(marko_node2);

  out.n(marko_node3);

  out.n(marko_node4);

  if (!out.global.currentUser) {
    out.n(marko_node8);

    out.n(marko_node9);
  }

  out.n(marko_node5);

  out.ee();

  out.ee();

  out.n(marko_node6);

  out.ee();

  out.n(marko_node7);

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/div-col-form-substancia/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    onCreate: function (input) {
        this.state = {
            listSubstance: [],
            listMedicine: [],
            search: input.search || '',
            id: '',
            qtd: input.qtd || '',
            unid: input.unid || false
        };
    },
    onInput: function (input) {
        return {
            className: input['class'],
            number: input['number'],
            buyButton: input['buy-button'] || false,
            type: input['type'],
            search: input['search'],
            unid: input['unid'],
            qtd: input['qtd']
        };
    },
    onUpdate: function (input) {
    },
    instantSearch: function (event) {
        console.log('change ', event.target.value);
        var self = this;
        self.state.search = event.target.value;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://behealthbrasil.com.br/api/search/substance/' + event.target.value, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 200) {
                var data = JSON.parse(this.responseText);
                console.log(data, data.length);
                var substances = data['substances'];
                var medicines = data['medicines'];
                self.state.listSubstance = [];
                self.state.listMedicine = [];
                if (substances.length) {
                    console.log('add');
                    for (let i = 0; i < substances.length; i++) {
                        self.state.listSubstance.push(substances[i]);
                        if (i > 5) {
                            self.setStateDirty('listSubstance');
                            break;
                        }
                    }
                    self.setStateDirty('listSubstance');
                } else {
                    console.log('clear');
                    self.state.listSubstance = [];
                }
                if (medicines.length) {
                    console.log('add');
                    for (let i = 0; i < medicines.length; i++) {
                        self.state.listMedicine.push(medicines[i]);
                        if (i > 5) {
                            self.setStateDirty('listMedicine');
                            break;
                        }
                    }
                    self.setStateDirty('listMedicine');
                } else {
                    console.log('clear medicine');
                    self.state.listMedicine = [];
                }
            }
        };
        if (self.state.search == '') {
            this.clearSearch();
        } else {
            xhr.send();
        }
    },
    chooseSubstance: function (substance) {
        console.log(substance);
        this.state.search = substance.keys[0];
        this.state.id = substance.id;
        this.state.listSubstance = [];
        this.state.unid = substance.unid;
    },
    chooseMedicine: function (medicine) {
        console.log('chooseMedicine', medicine);
        pubsub.emit('chooseMedicine', medicine);
        this.state.listMedicine = [];
        this.setStateDirty('listMedicine');
    },
    saveToMedicine: function (event) {
        this.state.qtd = event.target.value;
        pubsub.emit('chooseSubstance', this.state.id, this.state.qtd, this.state.search, this.state.unid);
    },
    clearSearch: function () {
        this.state.listSubstance = [];
        this.state.listMedicine = [];
        this.setStateDirty('listSubstance');
        this.setStateDirty('listMedicine');
        this.state.search = '';
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/div-col-form-substancia/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_forEach = marko_helpers.f,
    marko_attrs0 = {
        "class": "form-group col-xs-12 col-sm-8"
      },
    marko_attrs1 = {
        "class": "form-group col-xs-12 col-sm-4"
      },
    marko_attrs2 = {
        "class": "instant-result col-xs-6 col-md-8"
      },
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("ba0174"),
    marko_node0 = marko_createElement("P", null, 1, 0, marko_const_nextId())
      .t("Substâncias"),
    marko_attrs3 = {
        "class": "instant-result col-xs-6 col-md-8",
        style: "left:55%;"
      },
    marko_node1 = marko_createElement("P", null, 1, 0, marko_const_nextId())
      .t("Formúlas");

function render(input, out, __component, component, state) {
  var data = input;

  out.be("DIV", {
      "class": "col-xs-12 ontop",
      id: __component.id
    }, null, 4);

  out.be("DIV", marko_attrs0);

  out.e("LABEL", null, 2)
    .t("Substância ")
    .t(input.number);

  out.e("INPUT", {
      type: "text",
      "class": "form-control",
      name: "substancia",
      placeholder: "",
      value: state.search,
      "data-_oninput": __component.d("instantSearch")
    }, 0);

  if (state.listSubstance.length > 0) {
    out.be("DIV", marko_attrs2);

    out.n(marko_node0);

    marko_forEach(state.listSubstance, function(item) {
      if (item.keys.length > 0) {
        out.e("DIV", {
            "class": "instant-result-item",
            "data-_onclick": __component.d("chooseSubstance", [
                item
              ])
          }, 1, 4)
          .t(item.keys[0]);
      }
    });

    out.e("A", {
        href: "#",
        "data-_onclick": __component.d("clearSearch")
      }, 1)
      .t("limpar busca");

    out.ee();
  }

  if (state.listMedicine.length > 0) {
    out.be("DIV", marko_attrs3);

    out.n(marko_node1);

    marko_forEach(state.listMedicine, function(item) {
      out.e("DIV", {
          "class": "instant-result-item",
          "data-_onclick": __component.d("chooseMedicine", [
              item
            ])
        }, 1, 4)
        .t(item.label);
    });

    out.e("A", {
        href: "#",
        "data-_onclick": __component.d("clearSearch")
      }, 1)
      .t("limpar busca");

    out.ee();
  }

  out.ee();

  out.be("DIV", marko_attrs1);

  out.be("LABEL");

  out.t("Quantidade ");

  if (state.unid) {
    out.t("(");

    out.t(state.unid);

    out.t(")");
  }

  out.ee();

  out.e("INPUT", {
      type: "text",
      "class": "form-control",
      name: "substancia",
      placeholder: "",
      value: state.qtd,
      "data-_oninput": __component.d("saveToMedicine")
    }, 0);

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.builtin("buffer", "/buffer$4.9.1/index");
$_mod.installed("buffer$4.9.1", "base64-js", "1.2.0");
$_mod.main("/base64-js$1.2.0", "");
$_mod.def("/base64-js$1.2.0/index", function(require, exports, module, __filename, __dirname) { 'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function placeHoldersCount (b64) {
  var len = b64.length
  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // the number of equal signs (place holders)
  // if there are two placeholders, than the two characters before it
  // represent one byte
  // if there is only one, then the three characters before it represent 2 bytes
  // this is just a cheap hack to not do indexOf twice
  return b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0
}

function byteLength (b64) {
  // base64 is 4/3 + up to two characters of the original data
  return b64.length * 3 / 4 - placeHoldersCount(b64)
}

function toByteArray (b64) {
  var i, j, l, tmp, placeHolders, arr
  var len = b64.length
  placeHolders = placeHoldersCount(b64)

  arr = new Arr(len * 3 / 4 - placeHolders)

  // if there are placeholders, only get up to the last complete 4 chars
  l = placeHolders > 0 ? len - 4 : len

  var L = 0

  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]
    arr[L++] = (tmp >> 16) & 0xFF
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  if (placeHolders === 2) {
    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[L++] = tmp & 0xFF
  } else if (placeHolders === 1) {
    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[L++] = (tmp >> 8) & 0xFF
    arr[L++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var output = ''
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    output += lookup[tmp >> 2]
    output += lookup[(tmp << 4) & 0x3F]
    output += '=='
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])
    output += lookup[tmp >> 10]
    output += lookup[(tmp >> 4) & 0x3F]
    output += lookup[(tmp << 2) & 0x3F]
    output += '='
  }

  parts.push(output)

  return parts.join('')
}

});
$_mod.installed("buffer$4.9.1", "ieee754", "1.1.8");
$_mod.main("/ieee754$1.1.8", "");
$_mod.def("/ieee754$1.1.8/index", function(require, exports, module, __filename, __dirname) { exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

});
$_mod.installed("buffer$4.9.1", "isarray", "1.0.0");
$_mod.main("/isarray$1.0.0", "");
$_mod.def("/isarray$1.0.0/index", function(require, exports, module, __filename, __dirname) { var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

});
$_mod.def("/buffer$4.9.1/index", function(require, exports, module, __filename, __dirname) { /*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('/base64-js$1.2.0/index'/*'base64-js'*/)
var ieee754 = require('/ieee754$1.1.8/index'/*'ieee754'*/)
var isArray = require('/isarray$1.0.0/index'/*'isarray'*/)

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Due to various browser bugs, sometimes the Object implementation will be used even
 * when the browser supports typed arrays.
 *
 * Note:
 *
 *   - Firefox 4-29 lacks support for adding new properties to `Uint8Array` instances,
 *     See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *   - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *   - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *     incorrect length in some situations.

 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they
 * get the Object implementation, which is slower but behaves correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = global.TYPED_ARRAY_SUPPORT !== undefined
  ? global.TYPED_ARRAY_SUPPORT
  : typedArraySupport()

/*
 * Export kMaxLength after typed array support is determined.
 */
exports.kMaxLength = kMaxLength()

function typedArraySupport () {
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = {__proto__: Uint8Array.prototype, foo: function () { return 42 }}
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        arr.subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
}

function kMaxLength () {
  return Buffer.TYPED_ARRAY_SUPPORT
    ? 0x7fffffff
    : 0x3fffffff
}

function createBuffer (that, length) {
  if (kMaxLength() < length) {
    throw new RangeError('Invalid typed array length')
  }
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = new Uint8Array(length)
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    if (that === null) {
      that = new Buffer(length)
    }
    that.length = length
  }

  return that
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  if (!Buffer.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer)) {
    return new Buffer(arg, encodingOrOffset, length)
  }

  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new Error(
        'If encoding is specified then the first argument must be a string'
      )
    }
    return allocUnsafe(this, arg)
  }
  return from(this, arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192 // not used by this implementation

// TODO: Legacy, not needed anymore. Remove in next major version.
Buffer._augment = function (arr) {
  arr.__proto__ = Buffer.prototype
  return arr
}

function from (that, value, encodingOrOffset, length) {
  if (typeof value === 'number') {
    throw new TypeError('"value" argument must not be a number')
  }

  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length)
  }

  if (typeof value === 'string') {
    return fromString(that, value, encodingOrOffset)
  }

  return fromObject(that, value)
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(null, value, encodingOrOffset, length)
}

if (Buffer.TYPED_ARRAY_SUPPORT) {
  Buffer.prototype.__proto__ = Uint8Array.prototype
  Buffer.__proto__ = Uint8Array
  if (typeof Symbol !== 'undefined' && Symbol.species &&
      Buffer[Symbol.species] === Buffer) {
    // Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
    Object.defineProperty(Buffer, Symbol.species, {
      value: null,
      configurable: true
    })
  }
}

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be a number')
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative')
  }
}

function alloc (that, size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(that, size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(that, size).fill(fill, encoding)
      : createBuffer(that, size).fill(fill)
  }
  return createBuffer(that, size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(null, size, fill, encoding)
}

function allocUnsafe (that, size) {
  assertSize(size)
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0
    }
  }
  return that
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(null, size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(null, size)
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding')
  }

  var length = byteLength(string, encoding) | 0
  that = createBuffer(that, length)

  var actual = that.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    that = that.slice(0, actual)
  }

  return that
}

function fromArrayLike (that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  that = createBuffer(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayBuffer (that, array, byteOffset, length) {
  array.byteLength // this throws if `array` is not a valid ArrayBuffer

  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('\'offset\' is out of bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('\'length\' is out of bounds')
  }

  if (byteOffset === undefined && length === undefined) {
    array = new Uint8Array(array)
  } else if (length === undefined) {
    array = new Uint8Array(array, byteOffset)
  } else {
    array = new Uint8Array(array, byteOffset, length)
  }

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = array
    that.__proto__ = Buffer.prototype
  } else {
    // Fallback: Return an object instance of the Buffer class
    that = fromArrayLike(that, array)
  }
  return that
}

function fromObject (that, obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    that = createBuffer(that, len)

    if (that.length === 0) {
      return that
    }

    obj.copy(that, 0, 0, len)
    return that
  }

  if (obj) {
    if ((typeof ArrayBuffer !== 'undefined' &&
        obj.buffer instanceof ArrayBuffer) || 'length' in obj) {
      if (typeof obj.length !== 'number' || isnan(obj.length)) {
        return createBuffer(that, 0)
      }
      return fromArrayLike(that, obj)
    }

    if (obj.type === 'Buffer' && isArray(obj.data)) {
      return fromArrayLike(that, obj.data)
    }
  }

  throw new TypeError('First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.')
}

function checked (length) {
  // Note: cannot use `length < kMaxLength()` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength()) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength().toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (typeof ArrayBuffer !== 'undefined' && typeof ArrayBuffer.isView === 'function' &&
      (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    string = '' + string
  }

  var len = string.length
  if (len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
      case undefined:
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) return utf8ToBytes(string).length // assume utf8
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// The property is used by `Buffer.isBuffer` and `is-buffer` (in Safari 5-7) to detect
// Buffer instances.
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length | 0
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('Argument must be a Buffer')
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset  // Coerce to Number.
  if (isNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (Buffer.TYPED_ARRAY_SUPPORT &&
        typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new TypeError('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
      : (firstByte > 0xBF) ? 2
      : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = this.subarray(start, end)
    newBuf.__proto__ = Buffer.prototype
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; ++i) {
      newBuf[i] = this[i + start]
    }
  }

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = (value & 0xff)
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = (value & 0xff)
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value & 0xff)
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = (value & 0xff)
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start
  var i

  if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    // ascending copy from start
    for (i = 0; i < len; ++i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, start + len),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if (code < 256) {
        val = code
      }
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : utf8ToBytes(new Buffer(val, encoding).toString())
    var len = bytes.length
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function isnan (val) {
  return val !== val // eslint-disable-line no-self-compare
}

});
$_mod.def("/marko$4.1.3/runtime/helper-forRange", function(require, exports, module, __filename, __dirname) { module.exports = function forRangeHelper(from, to, step, callback) {
    if (step == null) {
        step = from <= to ? 1 : -1;
    }

    var i;

    if (step > 0) {
        for (i=from; i<=to; i += step) {
            callback(i);
        }
    } else {
        for (i=from; i>=to; i += step) {
            callback(i);
        }
    }

};
});
$_mod.main("/behealth$0.0.1/views/components/div-col-form-substancia", "index.marko");
$_mod.def("/behealth$0.0.1/views/components/section-hero-search/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";var Buffer=require("buffer").Buffer; 

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = ({
    onCreate: function (input) {
        Number.prototype.formatMoney = function (c, d, t) {
            var n = this, c = isNaN(c = Math.abs(c)) ? 2 : c, d = d == undefined ? '.' : d, t = t == undefined ? ',' : t, s = n < 0 ? '-' : '', i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), j = (j = i.length) > 3 ? j % 3 : 0;
            return s + (j ? i.substr(0, j) + t : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, '$1' + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : '');
        };
        this.state = {
            substancia: [{
                    type: 'search',
                    value: ''
                }],
            receipes: 1,
            cacheReceipes: [],
            cacheSubstance: {},
            cacheSubsComp: {},
            cart: [],
            upload: [],
            images: [],
            cartTotal: 0..formatMoney(2, ',', '.'),
            notListed: false,
            showSearch: 'true'
        };
        this.state['id'] = function (a) {
            if (a > 1) {
                return false;
            }
            return 'words';
        }(this.state.substancia);
    },
    onMount: function () {
        var self = this;
        var pharmacie = '424a8f61-3e2f-44d4-b6a5-f321269f5b7d';
        Number.prototype.formatMoney = function (c, d, t) {
            var n = this, c = isNaN(c = Math.abs(c)) ? 2 : c, d = d == undefined ? '.' : d, t = t == undefined ? ',' : t, s = n < 0 ? '-' : '', i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), j = (j = i.length) > 3 ? j % 3 : 0;
            return s + (j ? i.substr(0, j) + t : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, '$1' + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : '');
        };
        pubsub.on('chooseSubstance', function (key, value, key2, value2) {
            console.log('chooseSubstance', key, value);
            self.state.cacheSubstance[key] = value;
            self.state.cacheSubsComp[key2] = {
                unid: value2,
                qtd: value
            };
        });
        pubsub.on('uploadReceipe', function (id) {
            self.state.upload.push(id);
        });
        pubsub.on('setQtd', function (data) {
            self.state.cart[data.target].qtd = data.value;
            var total = 0;
            console.log(self.state.cart);
            for (var i = 0; i < self.state.cart.length; i++) {
                console.log('item', self.state.cart[i]);
                if (self.state.cart[i].label != 'Formula não Listada') {
                    total += self.state.cart[i].qtd * self.state.cart[i].price;
                    console.log('total', total);
                } else {
                    self.state.notListed = true;
                }
            }
            self.state.cartTotal = total.formatMoney(2, ',', '.');
            self.setStateDirty('cartTotal');
        });
        pubsub.on('chooseMedicine', function (data) {
            self.state.cart.push(data);
            self.setStateDirty('cart');
        });
    },
    onUpdate: function () {
        if (this.state.cart.length < 1 && this.state.images.length < 1) {
            this.state.showSearch = 'true';
        } else {
            this.state.showSearch = 'false';
        }
    },
    onInput: function (input) {
        return {
            size: input.size || 'normal',
            variant: input.variant || 'primary',
            body: input.label || input.renderBody,
            className: input['class']
        };
    },
    addSubstancia: function (event) {
        this.state.substancia.push({
            type: 'search',
            value: ''
        });
        this.setStateDirty('substancia');
        console.log(this.state.substancia);
    },
    searchFormula: function (event) {
        console.log('search formula', this.state.cacheSubstance);
        var self = this;
        var xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://behealthbrasil.com.br/api/search/medicine/', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return;
            if (this.status == 200) {
                console.log(this.responseText);
                var medicine = JSON.parse(this.responseText);
                if (medicine) {
                    self.state.cart.push(medicine);
                    self.setStateDirty('cart');
                } else {
                    var keys = [];
                    console.log('cached comp', self.state.cacheSubsComp);
                    for (var prop in self.state.cacheSubsComp) {
                        keys.push(' ' + prop + ' ' + self.state.cacheSubsComp[prop].qtd + ' ' + self.state.cacheSubsComp[prop].unid);
                    }
                    console.log('new comp', self.state.cacheSubsComp, keys);
                    var item = {
                        label: 'Formula não Listada',
                        composition: keys,
                        keys: self.state.cacheSubstance,
                        qtd: 0
                    };
                    self.state.cart.push(item);
                    self.setStateDirty('cart');
                    self.state.notListed = true;
                }
                console.log(self.state.cart);
                self.state.substancia = [{
                        type: 'search',
                        value: ''
                    }];
            }
        };
        console.log('sendData', self.state.cacheSubstance);
        var sendData = JSON.stringify(self.state.cacheSubstance);
        xhr.send(sendData);
    },
    addcart: function () {
        var item = this.state.cart[0];
        pubsub.emit('onAddCartItem', { item: item });
        this.state = {
            substancia: [{
                    type: 'search',
                    value: ''
                }],
            receipes: 1,
            cacheReceipes: [],
            cacheSubstance: {},
            cacheSubsComp: {},
            cart: [],
            upload: [],
            images: [],
            cartTotal: 0..formatMoney(2, ',', '.'),
            notListed: false
        };
    },
    clear: function () {
        this.state.substancia = [{
                type: 'search',
                value: ''
            }];
        this.state.receipes = 1;
        this.state.cacheReceipes = [];
        this.state.cacheSubstance = {};
        this.state.cacheSubsComp = {};
        this.state.cart = [];
        this.state.upload = [];
        this.state.images = [];
        this.state.cartTotal = 0..formatMoney(2, ',', '.');
        this.state.notListed = false;
    },
    preorder: function () {
        console.log(this.state.cart);
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', 'https://behealthbrasil.com.br/api/order', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
            if (this.readyState != 4)
                return false;
            if (this.status == 200) {
                pubsub.emit('showModal', {
                    type: 'preorder',
                    thisid: this.responseText
                });
            }
        };
        var data = {
            cart: this.state.cart,
            receipes: this.state.upload
        };
        xhr.send(JSON.stringify(data));
        this.emit('click', { event: event });
    },
    removeItem: function (i) {
        console.log('remove', i);
        this.state.cart.splice(i, 1);
        this.setStateDirty('cart');
    },
    showPanel: function (id) {
        console.log(id);
        console.log(this.target);
        $('.active').removeClass('active');
        var id = $(this.target).data('id');
        console.log('id', id);
        $(this.target).addClass('active');
        $('#' + id).addClass('active');
    },
    sendPhoto: function (evt) {
        console.info('evento ->', evt.target.files);
        var self = this;
        var files = evt.target.files;
        var formData = new FormData();
        formData.append('file', files[0]);
        console.log(formData);
        $.ajax({
            url: 'https://behealthbrasil.com.br/api/receipe',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (data) {
                console.info('files', data);
                var imageUrl = 'data:' + data.type + ';base64,' + Buffer.from(data.file).toString('base64');
                self.state.images.push(imageUrl);
                self.setStateDirty('images');
                pubsub.emit('uploadReceipe', data.id);
            }
        });
    }
}),
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/section-hero-search/index.marko", function() {
      return module.exports;
    }),
    pubsub = require('/raptor-pubsub$1.0.5/lib/index'/*"raptor-pubsub"*/),
    marko_forRange = require('/marko$4.1.3/runtime/helper-forRange'/*"marko/runtime/helper-forRange"*/),
    div_col_form_substancia_template = require('/behealth$0.0.1/views/components/div-col-form-substancia/index.marko'/*"../div-col-form-substancia"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_loadTag = marko_helpers.t,
    div_col_form_substancia_tag = marko_loadTag(div_col_form_substancia_template),
    marko_classAttr = marko_helpers.ca,
    app_number_spinner_template = require('/behealth$0.0.1/views/components/app-number-spinner/index.marko'/*"../app-number-spinner"*/),
    app_number_spinner_tag = marko_loadTag(app_number_spinner_template),
    marko_forEach = marko_helpers.f,
    marko_attrs0 = {
        id: "search"
      },
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("c916d9"),
    marko_node0 = marko_createElement("DIV", {
        id: "hero",
        style: "position: relative; height: inherit; background: none;\n      background-size: cover; color: #fff; width: 100%; font-size: 16px; display: table; z-index: 99; text-align: center;  text-transform: uppercase;"
      }, 1, 0, marko_const_nextId())
      .e("DIV", {
          "class": "intro_title",
          style: " padding-bottom: 5%; padding-top: 5%;"
        }, 2)
        .e("H3", {
            style: "font-weight: bolder;",
            "class": "animated fadeInDown"
          }, 5)
          .t("Compare e compre ")
          .e("SPAN", {
              style: "color:white;"
            }, 1)
            .t("manipulados")
          .t(" no único ")
          .e("SPAN", {
              style: "color:white;"
            }, 1)
            .t("comparador de preços")
          .t(" do Brasil")
        .e("P", {
            "class": "animated fadeInDown"
          }, 1)
          .t("Seguro. Rápido. Prático e sempre pelo menor preço! "),
    marko_node1 = marko_createElement("UL", {
        "class": "nav nav-tabs"
      }, 0, 0, marko_const_nextId()),
    marko_attrs1 = {
        "class": "tab-content"
      },
    marko_attrs2 = {
        "class": "tab-pane active",
        id: "buscar"
      },
    marko_attrs3 = {
        "class": "col-xs-12 col-sm-7",
        style: "margin-right: -5%;  margin-left: -5%;"
      },
    marko_node2 = marko_createElement("H3", {
        style: "margin-left: 5%;"
      }, 1, 0, marko_const_nextId())
      .t("Faça sua busca pela composição do medicamento, substância a substância"),
    marko_attrs4 = {
        "class": "",
        style: " padding: 0 15px;  padding-bottom: 13px;"
      },
    marko_attrs5 = {
        "class": "col-xs-12 col-sm-5 photoIcon"
      },
    marko_node3 = marko_createElement("DIV", {
        "class": "row"
      }, 2, 0, marko_const_nextId())
      .e("HR", null, 0)
      .e("A", {
          "class": "btn_1 green outline",
          style: " top: 7px; position: relative; margin-bottom: 10px;",
          href: "/cart"
        }, 2)
        .e("I", {
            "class": "icon-cart"
          }, 0)
        .t(" ir para o carrinho"),
    marko_attrs6 = {
        "class": "form-group col-xs-12",
        style: "position: static;"
      },
    marko_attrs7 = {
        "class": "form-group col-xs-12"
      },
    marko_node4 = marko_createElement("I", {
        "class": "icon-plus"
      }, 0, 0, marko_const_nextId()),
    marko_node5 = marko_createElement("I", {
        "class": "icon-search-1"
      }, 0, 0, marko_const_nextId()),
    marko_node6 = marko_createElement("SPAN", null, 1, 0, marko_const_nextId())
      .t(" Formúla "),
    marko_node7 = marko_createElement("H3", null, 1, 0, marko_const_nextId())
      .t("Envie nos sua receita."),
    marko_attrs8 = {
        "class": "col-xs-12",
        style: "padding:0;"
      },
    marko_attrs9 = {
        "class": "col-xs-12"
      },
    marko_attrs10 = {
        "class": "col-xs-12"
      },
    marko_attrs11 = {
        "class": "form-group"
      },
    marko_node8 = marko_createElement("LABEL", null, 1, 0, marko_const_nextId())
      .t("Tire uma foto"),
    marko_node9 = marko_createElement("LABEL", {
        "for": "file-6",
        style: "position: absolute; top: 36px;"
      }, 2, 0, marko_const_nextId())
      .e("SPAN", {
          style: "width:165px"
        }, 0)
      .e("STRONG", {
          style: "    background-color: #15aa7b; width: 170px; text-align: center; padding: 10px; color: white; border-radius: 3px; margin-left: 3px;"
        }, 2)
        .e("I", {
            "class": "icon-camera-7"
          }, 0)
        .t(" Tire uma foto…"),
    marko_attrs12 = {
        "class": "form-group"
      },
    marko_node10 = marko_createElement("LABEL", null, 1, 0, marko_const_nextId())
      .t("Faça upload"),
    marko_node11 = marko_createElement("LABEL", {
        "for": "file-7",
        style: " padding: 0px; line-height: 35px; margin-top: 2px; position: absolute; top: 26px;"
      }, 2, 0, marko_const_nextId())
      .e("SPAN", {
          style: "width:165px"
        }, 0)
      .e("STRONG", {
          style: "fill:white;background-color: #15aa7b; padding: 10px; padding-right: 15px; margin-left: 3px; border-radius: 2px;color: white;"
        }, 2)
        .e("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            width: "20",
            height: "17",
            viewBox: "0 0 20 17"
          }, 1, 1)
          .e("path", {
              d: "M10 0l-5.2 4.9h3.3v5.1h3.8v-5.1h3.3l-5.2-4.9zm9.3 11.5l-3.2-2.1h-2l3.4 2.6h-3.5c-.1 0-.2.1-.2.1l-.8 2.3h-6l-.8-2.2c-.1-.1-.1-.2-.2-.2h-3.6l3.4-2.6h-2l-3.2 2.1c-.4.3-.7 1-.6 1.5l.6 3.1c.1.5.7.9 1.2.9h16.3c.6 0 1.1-.4 1.3-.9l.6-3.1c.1-.5-.2-1.2-.7-1.5z"
            }, 0, 1)
        .t(" Escolha um arquivo…"),
    marko_attrs13 = {
        "class": "row"
      },
    marko_attrs14 = {
        style: "padding: 15px;"
      },
    marko_attrs15 = {
        "class": "table table-hover",
        id: "table"
      },
    marko_node12 = marko_createElement("THEAD", null, 1, 0, marko_const_nextId())
      .e("TR", null, 3)
        .e("TH", {
            "class": "col-md-2"
          }, 1)
          .t("Nome")
        .e("TH", {
            "class": "col-md-3"
          }, 1)
          .t("Fórmula")
        .e("TH", {
            "class": "col-md-4"
          }, 1)
          .t("Quantidade"),
    marko_attrs16 = {
        "class": "col-xs-12"
      },
    marko_node13 = marko_createElement("I", {
        "class": "icon-email"
      }, 0, 0, marko_const_nextId()),
    marko_attrs17 = {
        "class": "col-xl-12",
        style: "margin-bottom: 20px;  margin-left: 20px;"
      },
    marko_attrs18 = {
        "class": "col-xs-12"
      },
    marko_attrs19 = {
        "class": "price-value"
      },
    marko_node14 = marko_createElement("SPAN", {
        "class": "mo"
      }, 1, 0, marko_const_nextId())
      .t(" seu menor preço "),
    marko_attrs20 = {
        "class": "mo2"
      },
    marko_node15 = marko_createElement("I", {
        "class": "icon-plus"
      }, 0, 0, marko_const_nextId()),
    marko_node16 = marko_createElement("I", {
        "class": "icon-search-1"
      }, 0, 0, marko_const_nextId()),
    marko_attrs21 = {
        "class": "row"
      },
    marko_node17 = marko_createElement("H2", {
        "class": "receipe"
      }, 1, 0, marko_const_nextId())
      .t("Suas receitas"),
    marko_attrs22 = {
        "class": "col-xs-6"
      },
    marko_attrs23 = {
        "class": "col-xs-6"
      },
    marko_attrs24 = {
        "class": "col-xs-12"
      },
    marko_attrs25 = {
        "class": "form-group"
      },
    marko_node18 = marko_createElement("LABEL", null, 1, 0, marko_const_nextId())
      .t("Faça upload"),
    marko_node19 = marko_createElement("LABEL", {
        "for": "file-7",
        style: " padding: 0px; line-height: 35px; margin-top: 2px; position: absolute; top: 26px;"
      }, 2, 0, marko_const_nextId())
      .e("SPAN", {
          style: "width:165px"
        }, 0)
      .e("STRONG", {
          style: "fill:white;background-color: #15aa7b; padding: 10px; padding-right: 15px; margin-left: 3px; border-radius: 2px;color: white;"
        }, 2)
        .e("I", {
            "class": "icon-upload"
          }, 0)
        .t(" Escolha um arquivo…"),
    marko_attrs26 = {
        "class": "form-group"
      },
    marko_node20 = marko_createElement("LABEL", null, 1, 0, marko_const_nextId())
      .t("Tire uma foto"),
    marko_node21 = marko_createElement("LABEL", {
        "for": "file-6",
        style: "position: absolute; top: 36px;"
      }, 2, 0, marko_const_nextId())
      .e("SPAN", {
          style: "width:165px"
        }, 0)
      .e("STRONG", {
          style: "    background-color: #15aa7b; width: 170px; text-align: center; padding: 10px; color: white; border-radius: 3px; margin-left: 3px;"
        }, 2)
        .e("I", {
            "class": "icon-camera-7"
          }, 0)
        .t(" Tire uma foto…"),
    marko_attrs27 = {
        "class": "col-xs-6 col-sm-4"
      },
    marko_node22 = marko_createElement("I", {
        "class": "icon-email"
      }, 0, 0, marko_const_nextId()),
    marko_node23 = marko_createElement("I", {
        "class": "icon-search-1"
      }, 0, 0, marko_const_nextId());

function render(input, out, __component, component, state) {
  var data = input;

  out.be("SECTION", {
      id: __component.id
    }, null, 4);

  out.be("DIV", marko_attrs0);

  out.n(marko_node0);

  out.n(marko_node1);

  out.be("DIV", marko_attrs1);

  out.be("DIV", marko_attrs2);

  out.be("DIV", {
      "class": marko_classAttr([
          "row",
          state.showSearch
        ])
    }, null, 4);

  out.be("DIV", marko_attrs3);

  out.n(marko_node2);

  marko_forRange(1, state.substancia.length, null, function(i) {
    div_col_form_substancia_tag({
        number: [
            i
          ],
        type: state.substancia[i - 1].type,
        search: state.substancia[i - 1].value
      }, out);
  });

  out.e("DIV", marko_attrs4, 2)
    .e("DIV", marko_attrs6, 1)
      .e("BUTTON", {
          "class": "btn_1 green outline btn-block",
          "data-_onclick": __component.d("addSubstancia")
        }, 2, 4)
        .n(marko_node4)
        .t(" Outra substância")
    .e("DIV", marko_attrs7, 1)
      .e("BUTTON", {
          "class": "btn_1 green btn-block",
          "data-_onclick": __component.d("searchFormula")
        }, 3, 4)
        .n(marko_node5)
        .t(" Buscar ")
        .n(marko_node6);

  out.ee();

  out.e("DIV", marko_attrs5, 2)
    .n(marko_node7)
    .e("DIV", marko_attrs8, 2)
      .e("DIV", marko_attrs9, 1)
        .e("DIV", marko_attrs11, 3)
          .n(marko_node8)
          .e("INPUT", {
              type: "file",
              name: "file-6",
              "class": "form-control",
              style: "padding-left: 17px; padding-top: 10px; position: relative; z-index:100;background-color: transparent;",
              "data-_onchange": __component.d("sendPhoto")
            }, 0)
          .n(marko_node9)
      .e("DIV", marko_attrs10, 1)
        .e("DIV", marko_attrs12, 3)
          .n(marko_node10)
          .e("INPUT", {
              "class": "form-control",
              name: "file-7",
              type: "file",
              style: " padding-left: 60px; padding-top: 11px; position: relative; z-index:100;background-color: transparent;",
              "data-_onchange": __component.d("sendPhoto")
            }, 0)
          .n(marko_node11);

  out.ee();

  if (state.cart.length > 0) {
    out.be("DIV", marko_attrs13);

    out.be("DIV", marko_attrs14);

    out.e("P", {
        "class": marko_classAttr([
            "message",
            "col-xs-12",
            state.messageType
          ]),
        style: "margin-right:10px;"
      }, 1, 4)
      .t("Se essa é a formula que você procura, selecione a quantidade e adicione-a ao seu carrinho.");

    out.be("TABLE", marko_attrs15);

    out.n(marko_node12);

    out.be("TBODY");

    marko_forRange(0, state.cart.length - 1, null, function(i) {
      out.be("TR");

      out.e("TD", null, 1)
        .t(state.cart[i].label);

      out.e("TD", null, 1)
        .t(state.cart[i].composition);

      out.be("TD");

      app_number_spinner_tag({
          value: state.cart[i].qtd,
          index: i
        }, out);

      out.t(state.cart[i].unidade);

      out.ee();

      out.ee();
    });

    out.ee();

    out.ee();

    out.ee();

    if (state.notListed) {
      out.e("DIV", marko_attrs16, 1)
        .e("BUTTON", {
            "class": "btn_1 green outline col-xs-4",
            style: " top: 7px; position: relative; margin-bottom: 10px;",
            "data-_onclick": __component.d("preorder")
          }, 2, 4)
          .n(marko_node13)
          .t(" Pedir orçamento");
    } else {
      out.e("DIV", marko_attrs17, 3)
        .e("SPAN", marko_attrs19, 2)
          .t("R$ ")
          .t(state.cartTotal)
        .n(marko_node14)
        .e("SPAN", marko_attrs20, 4)
          .t("pelas ")
          .t(state.cart[0].qtd)
          .t(" ")
          .t(state.cart[0].unidade);

      out.e("DIV", marko_attrs18, 2)
        .e("BUTTON", {
            "class": "btn_1 green col-xs-5",
            style: "margin-right:10px;",
            "data-_onclick": __component.d("addcart")
          }, 2, 4)
          .n(marko_node15)
          .t(" Addicionar ao carrinho")
        .e("BUTTON", {
            "class": "btn_1 green outline col-xs-5",
            style: "position: relative; margin-bottom: 10px;",
            "data-_onclick": __component.d("clear")
          }, 2, 4)
          .n(marko_node16)
          .t(" Buscar outra formula");
    }

    out.ee();
  }

  if (state.images.length > 0) {
    out.be("DIV", marko_attrs21);

    out.n(marko_node17);

    out.e("P", {
        "class": marko_classAttr([
            "message",
            "col-xs-12",
            state.messageType
          ]),
        style: "margin-right:10px;margin-top:20px;"
      }, 1, 4)
      .t("Se precisar envie outro arquivo.");

    out.e("DIV", marko_attrs22, 1)
      .e("DIV", marko_attrs25, 3)
        .n(marko_node18)
        .e("INPUT", {
            "class": "form-control",
            name: "file-7",
            type: "file",
            style: " padding-left: 60px; padding-top: 11px; position: relative; z-index:100;background-color: transparent;",
            "data-_onchange": __component.d("sendPhoto")
          }, 0)
        .n(marko_node19);

    out.e("DIV", marko_attrs23, 1)
      .e("DIV", marko_attrs26, 3)
        .n(marko_node20)
        .e("INPUT", {
            type: "file",
            name: "file-6",
            "class": "form-control",
            style: "padding-left: 17px; padding-top: 10px; position: relative; z-index:100;background-color: transparent;",
            "data-_onchange": __component.d("sendPhoto")
          }, 0)
        .n(marko_node21);

    marko_forEach(state.images, function(item) {
      out.e("DIV", marko_attrs27, 1)
        .e("IMG", {
            src: item,
            "class": "img-responsive"
          }, 0);
    });

    out.e("DIV", marko_attrs24, 3)
      .e("P", {
          "class": marko_classAttr([
              "message",
              "col-xs-12",
              state.messageType
            ]),
          style: "margin-right:10px; margin-top: -20px;"
        }, 1, 4)
        .t("Assim que tiver terminado de subir as receitas, clique em pedir orçamento")
      .e("BUTTON", {
          "class": "btn_1 green col-xs-5",
          style: "margin-right:10px;",
          "data-_onclick": __component.d("preorder")
        }, 2, 4)
        .n(marko_node22)
        .t(" Pedir Orçamento")
      .e("BUTTON", {
          "class": "btn_1 green outline col-xs-5",
          style: "position: relative; margin-bottom: 10px;",
          "data-_onclick": __component.d("clear")
        }, 2, 4)
        .n(marko_node23)
        .t(" Reiniciar a busca");

    out.ee();
  }

  out.ee();

  out.n(marko_node3);

  out.ee();

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType,
    id: "search_container"
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/comp-banner-full-line/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = {
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/comp-banner-full-line/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("bb27ed"),
    marko_node0 = marko_createElement("H4", null, 2, 0, marko_const_nextId())
      .t("Você ")
      .e("SPAN", null, 1)
        .t("SABIA?"),
    marko_node1 = marko_createElement("P", {
        style: "font-size:18px"
      }, 1, 0, marko_const_nextId())
      .t(" O preço de um manipulado para outro pode variar em até 400% ");

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.e("DIV", {
      "class": "banner colored add_bottom_30",
      style: "margin-bottom:0",
      id: __component.id
    }, 2, 4)
    .n(marko_node0)
    .n(marko_node1);
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/group-box-icons/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = {
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/group-box-icons/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("f92cbd"),
    marko_node0 = marko_createElement("DIV", {
        "class": "col-md-4 wow zoomIn",
        "data-wow-delay": "0.2s"
      }, 1, 0, marko_const_nextId())
      .e("DIV", {
          "class": "feature_home"
        }, 4)
        .t(" ")
        .e("I", {
            "class": "icon-truck-1"
          }, 0)
        .e("H3", null, 2)
          .t("Frete ")
          .e("SPAN", null, 1)
            .t("GRÁTIS")
        .e("P", null, 1)
          .e("A", {
              href: "#"
            }, 1)
            .t(" para pedidos feitos nos estabelecimentos da sua região "),
    marko_node1 = marko_createElement("DIV", {
        "class": "col-md-4 wow zoomIn",
        "data-wow-delay": "0.4s"
      }, 1, 0, marko_const_nextId())
      .e("DIV", {
          "class": "feature_home"
        }, 4)
        .t(" ")
        .e("I", {
            "class": " icon-money-2"
          }, 0)
        .e("H3", null, 2)
          .e("SPAN", null, 1)
            .t("Compromisso")
          .t(" sempre")
        .e("P", null, 3)
          .t(" ")
          .e("A", {
              href: "#"
            }, 1)
            .t(" O menor preço garantido. Aqui a gente cobre qualquer oferta.")
          .t(" "),
    marko_node2 = marko_createElement("DIV", {
        "class": "col-md-4 wow zoomIn",
        "data-wow-delay": "0.6s"
      }, 1, 0, marko_const_nextId())
      .e("DIV", {
          "class": "feature_home"
        }, 4)
        .t(" ")
        .e("I", {
            "class": " icon-newspaper-1"
          }, 0)
        .e("H3", null, 3)
          .t("Venha ser ")
          .e("SPAN", null, 1)
            .t("#BeHealth")
          .t(" ")
        .e("P", null, 2)
          .e("A", {
              href: "https://blog.behealthbrasil.com.br",
              target: "_blank"
            }, 1)
            .t(" Acompanhe o blog da maior rede de saúde e bem estar")
          .t(" ");

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.e("DIV", {
      "class": "row",
      id: __component.id
    }, 3, 4)
    .n(marko_node0)
    .n(marko_node1)
    .n(marko_node2);
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/group-notebook-list/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = {
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/group-notebook-list/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("b3fca2"),
    marko_node0 = marko_createElement("DIV", {
        "class": "col-md-8 col-sm-6 hidden-xs"
      }, 3, 0, marko_const_nextId())
      .t(" ")
      .e("IMG", {
          src: "img/laptop.png",
          alt: "Laptop",
          "class": "img-responsive laptop"
        }, 0)
      .t(" "),
    marko_node1 = marko_createElement("DIV", {
        "class": "col-md-4 col-sm-6"
      }, 5, 0, marko_const_nextId())
      .e("H3", {
          style: "font-size:16px;"
        }, 2)
        .e("SPAN", null, 1)
          .t("Experimente")
        .t(" comprar com a Behealth")
      .e("UL", {
          "class": "list_order"
        }, 3)
        .e("LI", {
            style: "font-size: 20px;"
          }, 2)
          .e("SPAN", null, 1)
            .t("1")
          .t(" Insira as substâncias do seu medicamento ou envie a sua receita")
        .e("LI", {
            style: "font-size: 20px;"
          }, 2)
          .e("SPAN", null, 1)
            .t("2")
          .t(" Clique em “Buscar fórmula” e veja sua fórmula")
        .e("LI", {
            style: "font-size: 20px;"
          }, 2)
          .e("SPAN", null, 1)
            .t("3")
          .t(" Agora, é só clicar em “Fazer orçamento” e descobrir o melhor negócio!")
      .t(" ")
      .e("A", {
          href: "/home",
          "class": "btn_1"
        }, 1)
        .t("Experimente já")
      .t(" ");

function render(input, out, __component, component, state) {
  var data = input;

  out.e("DIV", {
      "class": "row",
      id: __component.id
    }, 2, 4)
    .n(marko_node0)
    .n(marko_node1);
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});
$_mod.main("/behealth$0.0.1/views/components/group-box-icons", "index.marko");
$_mod.main("/behealth$0.0.1/views/components/group-notebook-list", "index.marko");
$_mod.def("/behealth$0.0.1/views/components/app-white-popular/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.1.3 - DO NOT EDIT
"use strict";

var marko_template = module.exports = require('/marko$4.1.3/vdom'/*"marko/vdom"*/).t(),
    marko_component = {
        onInput: function(input) {
          return {
              size: input.size || "normal",
              variant: input.variant || "primary",
              body: input.label || input.renderBody,
              className: input["class"]
            };
        },
        handleClick: function(event) {
          this.emit("click", {
              event: event
            });
        }
      },
    marko_components = require('/marko$4.1.3/components/index-browser'/*"marko/components"*/),
    marko_registerComponent = marko_components.rc,
    marko_componentType = marko_registerComponent("/behealth$0.0.1/views/components/app-white-popular/index.marko", function() {
      return module.exports;
    }),
    group_box_icons_template = require('/behealth$0.0.1/views/components/group-box-icons/index.marko'/*"../group-box-icons"*/),
    marko_helpers = require('/marko$4.1.3/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_loadTag = marko_helpers.t,
    group_box_icons_tag = marko_loadTag(group_box_icons_template),
    group_notebook_list_template = require('/behealth$0.0.1/views/components/group-notebook-list/index.marko'/*"../group-notebook-list"*/),
    group_notebook_list_tag = marko_loadTag(group_notebook_list_template),
    marko_attrs0 = {
        "class": "container margin_60"
      },
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("f6b69c"),
    marko_node0 = marko_createElement("HR", null, 0, 0, marko_const_nextId());

function render(input, out, __component, component, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.be("DIV", {
      "class": "",
      id: __component.id
    }, null, 4);

  out.be("DIV", marko_attrs0);

  group_box_icons_tag({}, out);

  out.n(marko_node0);

  group_notebook_list_tag({}, out);

  out.ee();

  out.ee();
}

marko_template._ = marko_components.r(render, {
    type: marko_componentType
  }, marko_component);

marko_template.Component = marko_components.c(marko_component, marko_template._);

});