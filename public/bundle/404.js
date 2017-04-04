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

$_mod.remap("/marko$4.0.0-rc.18/widgets/index", "/marko$4.0.0-rc.18/widgets/index-browser");
$_mod.remap("/marko$4.0.0-rc.18/widgets/init-widgets", "/marko$4.0.0-rc.18/widgets/init-widgets-browser");
$_mod.installed("marko$4.0.0-rc.18", "warp10", "1.3.3");
$_mod.def("/warp10$1.3.3/src/finalize", function(require, exports, module, __filename, __dirname) { var isArray = Array.isArray;

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
$_mod.def("/warp10$1.3.3/finalize", function(require, exports, module, __filename, __dirname) { module.exports = require('/warp10$1.3.3/src/finalize'/*'./src/finalize'*/);
});
$_mod.remap("/marko$4.0.0-rc.18/widgets/util", "/marko$4.0.0-rc.18/widgets/util-browser");
$_mod.def("/marko$4.0.0-rc.18/widgets/util-browser", function(require, exports, module, __filename, __dirname) { var widgetLookup = {};

var defaultDocument = document;

function getWidgetForEl(el, doc) {
    if (el) {
        var node = typeof el === 'string' ? (doc || defaultDocument).getElementById(el) : el;
        if (node) {
            var widget = node._w;

            while(widget) {
                var rootFor = widget.$__rootFor;
                if (rootFor)  {
                    widget = rootFor;
                } else {
                    break;
                }
            }

            return widget;
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
 * This method handles invoking a widget's event handler method
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
function emitLifecycleEvent(widget, eventType, eventArg1, eventArg2) {
    var listenerMethod = widget[lifecycleEventMethods[eventType]];

    if (listenerMethod) {
        listenerMethod.call(widget, eventArg1, eventArg2);
    }

    widget.emit(eventType, eventArg1, eventArg2);
}

function destroyWidgetForEl(el) {
    var widgetToDestroy = el._w;
    if (widgetToDestroy) {
        widgetToDestroy.$__destroyShallow();
        el._w = null;

        while ((widgetToDestroy = widgetToDestroy.$__rootFor)) {
            widgetToDestroy.$__rootFor = null;
            widgetToDestroy.$__destroyShallow();
        }
    }
}
function destroyElRecursive(el) {
    var curChild = el.firstChild;
    while(curChild) {
        if (curChild.nodeType == 1) {
            destroyWidgetForEl(curChild);
            destroyElRecursive(curChild);
        }
        curChild = curChild.nextSibling;
    }
}

var nextUniqueId = 0;

function nextWidgetId() {
    return 'wc' + (nextUniqueId++);
}

function getElementById(doc, id) {
    return doc.getElementById(id);
}

function attachBubblingEvent(widgetDef, handlerMethodName, extraArgs) {
    if (handlerMethodName) {
        return extraArgs ?
            [handlerMethodName, widgetDef.id, extraArgs] :
            [handlerMethodName, widgetDef.id];
    }
}

exports.$__widgetLookup = widgetLookup;
exports.$__getWidgetForEl = getWidgetForEl;
exports.$__emitLifecycleEvent = emitLifecycleEvent;
exports.$__destroyWidgetForEl = destroyWidgetForEl;
exports.$__destroyElRecursive = destroyElRecursive;
exports.$__nextWidgetId = nextWidgetId;
exports.$__getElementById = getElementById;
exports.$__attachBubblingEvent = attachBubblingEvent;
});
$_mod.def("/marko$4.0.0-rc.18/widgets/bubble", function(require, exports, module, __filename, __dirname) { module.exports = [
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
$_mod.def("/marko$4.0.0-rc.18/widgets/event-delegation", function(require, exports, module, __filename, __dirname) { var widgetLookup = require('/marko$4.0.0-rc.18/widgets/util-browser'/*'./util'*/).$__widgetLookup;
var isArray = Array.isArray;

var listenersAttached;

function getEventAttribute(el, attrName) {
    var virtualAttrs = el._vattrs;

    if (virtualAttrs) {
        return el._vattrs[attrName];
    } else {
        var attrValue = el.getAttribute(attrName);
        if (attrValue) {
            // <method_name> <widget_id>[ <extra_args_index]
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
    var targetWidgetId = target[1];
    var extraArgs = target[2];

    var targetWidget = widgetLookup[targetWidgetId];


    if (!targetWidget) {
        return;
    }

    var targetFunc = targetWidget[targetMethod];
    if (!targetFunc) {
        throw Error('Method not found: ' + targetMethod);
    }

    if (extraArgs != null) {
        if (typeof extraArgs === 'number') {
            extraArgs = targetWidget.$__bubblingDomEvents[extraArgs];
            if (!isArray(extraArgs)) {
                extraArgs = [extraArgs];
            }
        }
    }

    // Invoke the widget method
    if (extraArgs) {
        targetFunc.apply(targetWidget, extraArgs.concat(event, node));
    } else {
        targetFunc.call(targetWidget, event, node);
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
    // is from a DOM event type to a method of a widget.
    require('/marko$4.0.0-rc.18/widgets/bubble'/*'./bubble'*/).forEach(function addBubbleHandler(eventType) {
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
            // widget methods
            var attrName = 'data-_on' + eventType;
            var target;

            // Attributes will have the following form:
            // on<event_type>("<target_method>|<widget_id>")

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
    if (!listenersAttached) {
        listenersAttached = true;
        attachBubbleEventListeners(doc);
    }
};
});
$_mod.installed("marko$4.0.0-rc.18", "events-light", "1.0.5");
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
$_mod.def("/marko$4.0.0-rc.18/runtime/events", function(require, exports, module, __filename, __dirname) { var EventEmitter = require('/events-light$1.0.5/src/index'/*'events-light'*/);
module.exports = new EventEmitter();
});
$_mod.def("/marko$4.0.0-rc.18/widgets/nextRepeatedId", function(require, exports, module, __filename, __dirname) { var REPEATED_ID_KEY = '$rep';

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
$_mod.installed("marko$4.0.0-rc.18", "raptor-util", "3.1.0");
$_mod.def("/raptor-util$3.1.0/extend", function(require, exports, module, __filename, __dirname) { module.exports = function extend(target, source) { //A simple function to copy properties from one object to another
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
$_mod.remap("/marko$4.0.0-rc.18/widgets/registry", "/marko$4.0.0-rc.18/widgets/registry-browser");
$_mod.remap("/marko$4.0.0-rc.18/widgets/loadWidget", "/marko$4.0.0-rc.18/widgets/loadWidget-dynamic");
$_mod.def("/marko$4.0.0-rc.18/widgets/loadWidget-dynamic", function(require, exports, module, __filename, __dirname) { 'use strict';

module.exports = function load(typeName) {
    // We make the assumption that the widget type name is a path to a
    // fully resolved module path and that the module exists
    // as a CommonJS module
    return require(typeName);
};
});
$_mod.def("/marko$4.0.0-rc.18/widgets/State", function(require, exports, module, __filename, __dirname) { var extend = require('/raptor-util$3.1.0/extend'/*'raptor-util/extend'*/);

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

function State(widget, initialState) {
    this.$__widget = widget;
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
            // This is the first time we are modifying the widget state
            // so introduce some properties to do some tracking of
            // changes to the state
            this.$__dirty = true; // Mark the widget state as dirty (i.e. modified)
            this.$__old = rawState;
            this.$__raw = rawState = extend({}, rawState);
            this.$__changes = {};
            this.$__widget.$__queueUpdate();
        }

        this.$__changes[name] = value;

        if (value === undefined) {
            // Don't store state properties with an undefined or null value
            delete rawState[name];
        } else {
            // Otherwise, store the new value in the widget state
            rawState[name] = value;
        }
    },
    toJSON: function() {
        return this.$__raw;
    }
};

module.exports = State;
});
$_mod.def("/marko$4.0.0-rc.18/runtime/dom-insert", function(require, exports, module, __filename, __dirname) { var extend = require('/raptor-util$3.1.0/extend'/*'raptor-util/extend'*/);
var widgetsUtil = require('/marko$4.0.0-rc.18/widgets/util-browser'/*'../widgets/util'*/);
var destroyWidgetForEl = widgetsUtil.$__destroyWidgetForEl;
var destroyElRecursive = widgetsUtil.$__destroyElRecursive;

function resolveEl(el) {
    if (typeof el === 'string') {
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
    destroyWidgetForEl(referenceEl);
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
                if (curChild.nodeType === 1) {
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
$_mod.main("/marko$4.0.0-rc.18", "runtime/index");
$_mod.remap("/marko$4.0.0-rc.18/runtime/env-init", false);
$_mod.def("/marko$4.0.0-rc.18/runtime/createOut", function(require, exports, module, __filename, __dirname) { var actualCreateOut;

function setCreateOut(createOutFunc) {
    actualCreateOut = createOutFunc;
}

function createOut(globalData) {
    return actualCreateOut(globalData);
}

createOut.$__setCreateOut = setCreateOut;

module.exports = createOut;
});
$_mod.main("/marko$4.0.0-rc.18/runtime/loader", "");
$_mod.remap("/marko$4.0.0-rc.18/runtime/loader/index", "/marko$4.0.0-rc.18/runtime/loader/index-browser");
$_mod.remap("/marko$4.0.0-rc.18/runtime/loader/index-browser", "/marko$4.0.0-rc.18/runtime/loader/index-browser-dynamic");
$_mod.def("/marko$4.0.0-rc.18/runtime/loader/index-browser-dynamic", function(require, exports, module, __filename, __dirname) { 'use strict';
module.exports = function load(templatePath) {
    // We make the assumption that the template path is a
    // fully resolved module path and that the module exists
    // as a CommonJS module
    return require(templatePath);
};
});
$_mod.def("/marko$4.0.0-rc.18/runtime/index", function(require, exports, module, __filename, __dirname) { 'use strict';
({})/*require('./env-init')*/; // no-op in the browser, but enables extra features on the server

exports.createOut = require('/marko$4.0.0-rc.18/runtime/createOut'/*'./createOut'*/);
exports.load = require('/marko$4.0.0-rc.18/runtime/loader/index-browser-dynamic'/*'./loader'*/);
exports.events = require('/marko$4.0.0-rc.18/runtime/events'/*'./events'*/);
});
$_mod.def("/marko$4.0.0-rc.18/runtime/RenderResult", function(require, exports, module, __filename, __dirname) { var domInsert = require('/marko$4.0.0-rc.18/runtime/dom-insert'/*'./dom-insert'*/);

function checkAddedToDOM(result, method) {
    if (!result.$__widgets) {
        throw Error('Not added to DOM');
    }
}

function getWidgetDefs(result) {
    var widgetDefs = result.$__widgets;

    if (widgetDefs.length === 0) {
        throw Error('No widget');
    }
    return widgetDefs;
}

function RenderResult(out) {
   this.out = this.$__out = out;
   this.$__widgets = null;
}

module.exports = RenderResult;

var proto = RenderResult.prototype = {
    getWidget: function() {
        checkAddedToDOM(this, 'getWidget');

        var rerenderWidgetInfo = this.$__out.global.$w;
        var rerenderWidget = rerenderWidgetInfo && rerenderWidgetInfo[0];
        if (rerenderWidget) {
            return rerenderWidget;
        }

        return getWidgetDefs(this)[0].$__widget;
    },
    getWidgets: function(selector) {
        checkAddedToDOM(this, 'getWidgets');

        var widgetDefs = getWidgetDefs(this);

        var widgets = [];
        var i;

        for (i = 0; i < widgetDefs.length; i++) {
            var widget = widgetDefs[i].$__widget;
            if (!selector || selector(widget)) {
                widgets.push(widget);
            }
        }

        return widgets;
    },

    afterInsert: function(doc) {
        var out = this.$__out;
        var widgetsContext = out.global.widgets;
        if (widgetsContext) {
            this.$__widgets = widgetsContext.$__widgets;
            widgetsContext.$__initWidgets(doc);
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
    toJSON: function() {
        return this.$__out.$__getOutput();
    },
    document: typeof document !== 'undefined' && document
};

// Add all of the following DOM methods to Widget.prototype:
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
$_mod.installed("marko$4.0.0-rc.18", "listener-tracker", "2.0.0");
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
$_mod.def("/raptor-util$3.1.0/inherit", function(require, exports, module, __filename, __dirname) { function inherit(ctor, superCtor, copyProps) {
    var oldProto = ctor.prototype;
    var newProto = ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
            value: ctor,
            writable: true,
            configurable: true
        }
    });
    if (oldProto && copyProps !== false) {
        var propertyNames = Object.getOwnPropertyNames(oldProto);
        for (var i = 0; i < propertyNames.length; i++) {
            var name = propertyNames[i];
            var descriptor = Object.getOwnPropertyDescriptor(oldProto, name);
            Object.defineProperty(newProto, name, descriptor);
        }
    }
    ctor.$super = superCtor;
    ctor.prototype = newProto;
    return ctor;
}


module.exports = inherit;
inherit._inherit = inherit;

});
$_mod.def("/marko$4.0.0-rc.18/widgets/update-manager", function(require, exports, module, __filename, __dirname) { 'use strict';

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
 * updates to widgets.
 */
function updateUnbatchedWidgets() {
    if (unbatchedQueue.length) {
        try {
            updateWidgets(unbatchedQueue);
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

    setImmediate(updateUnbatchedWidgets);
}

function updateWidgets(queue) {
    // Loop over the widgets in the queue and update them.
    // NOTE: It is okay if the queue grows during the iteration
    //       since we will still get to them at the end
    for (var i=0; i<queue.length; i++) {
        var widget = queue[i];
        widget.update(); // Do the actual widget update
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
            // Update all of the widgets that where queued up
            // in this batch (if any)
            if (batch.$__queue) {
                updateWidgets(batch.$__queue);
            }
        } finally {
            // Now that we have completed the update of all the widgets
            // in this batch we need to remove it off the top of the stack
            batchStack.length--;
        }
    }
}

function queueWidgetUpdate(widget) {
    var batchStackLen = batchStack.length;

    if (batchStackLen) {
        // When a batch update is started we push a new batch on to a stack.
        // If the stack has a non-zero length then we know that a batch has
        // been started so we can just queue the widget on the top batch. When
        // the batch is ended this widget will be updated.
        var batch = batchStack[batchStackLen-1];

        // We default the batch queue to null to avoid creating an Array instance
        // unnecessarily. If it is null then we create a new Array, otherwise
        // we push it onto the existing Array queue
        if (batch.$__queue) {
            batch.$__queue.push(widget);
        } else {
            batch.$__queue = [widget];
        }
    } else {
        // We are not within a batched update. We need to schedule a batch update
        // for the process.nextTick (if that hasn't been done already) and we will
        // add the widget to the unbatched queued
        scheduleUpdates();
        unbatchedQueue.push(widget);
    }
}

exports.$__queueWidgetUpdate = queueWidgetUpdate;
exports.$__batchUpdate = batchUpdate;
});
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/VNode", function(require, exports, module, __filename, __dirname) { /* jshint newcap:false */

function assignNamespace(node, namespaceURI) {
    node.namespaceURI = namespaceURI;

    var curChild = node.$__firstChild;
    while(curChild) {
        if (curChild.$__nsAware) {
            assignNamespace(curChild, namespaceURI);
        }
        curChild = curChild.$__nextSibling;
    }
}

function VNode() {}

VNode.prototype = {
    $__VNode: function(finalChildCount) {
        this.$__finalChildCount = finalChildCount;
        this.$__childCount = 0;
        this.$__firstChild = undefined;
        this.$__lastChild = undefined;
        this.$__parentNode = undefined;
        this.$__nextSibling = undefined;
    },
    // removeChildren: function() {
    //     this.$__firstChild = undefined;
    //     this.$__childCount = 0;
    //     this.$__lastChild = undefined;
    // },

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
            var namespaceURI;

            if (child.$__nsAware && (namespaceURI = this.namespaceURI) && !child.namespaceURI) {
                assignNamespace(child, namespaceURI);
            }

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
        if (this.$__childCount === this.$__finalChildCount && this.$__parentNode) {
            return this.$__parentNode.$__finishChild();
        } else {
            return this;
        }
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
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/VElement", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.0.0-rc.18/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.1.0/inherit'/*'raptor-util/inherit'*/);
var extend = require('/raptor-util$3.1.0/extend'/*'raptor-util/extend'*/);
var defineProperty = Object.defineProperty;

var NS_XLINK = 'http://www.w3.org/1999/xlink';
var ATTR_XLINK_HREF = 'xlink:href';
var ATTR_HREF = 'href';
var EMPTY_OBJECT = Object.freeze({});
var ATTR_MARKO_CONST = 'data-marko-const';

var specialAttrRegexp = /^data-_/;

function removePreservedAttributes(attrs, clone) {
    var preservedAttrs = attrs['data-_noupdate'];
    if (preservedAttrs) {
        if (clone) {
            attrs = extend({}, attrs);
        }
        preservedAttrs.forEach(function(preservedAttrName) {
            delete attrs[preservedAttrName];
        });
    }

    return attrs;
}

function convertAttrValue(type, value) {
    if (value === true) {
        return '';
    } else if (type === 'object') {
        return JSON.stringify(value);
    } else {
        return value.toString();
    }
}

function VElementClone(other) {
    extend(this, other);
    this.$__parentNode = undefined;
    this.$__nextSibling = undefined;
}

function VElement(tagName, attrs, childCount, constId) {
    var namespaceURI;
    var isTextArea;

    switch(tagName) {
        case 'svg':
            namespaceURI = 'http://www.w3.org/2000/svg';
            break;
        case 'math':
            namespaceURI = 'http://www.w3.org/1998/Math/MathML';
            break;
        case 'textarea':
        case 'TEXTAREA':
            isTextArea = true;
            break;
    }

    this.$__VNode(childCount);

    if (constId) {
        if (!attrs) {
            attrs = {};
        }
        attrs[ATTR_MARKO_CONST] = constId;
    }

    this.$__attributes = attrs || EMPTY_OBJECT;
    this.$__isTextArea = isTextArea;
    this.namespaceURI = namespaceURI;
    this.nodeName = tagName;
    this.$__value = undefined;
    this.$__constId = constId;
}

VElement.prototype = {
    $__VElement: true,

    nodeType: 1,

    $__nsAware: true,

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
    e: function(tagName, attrs, childCount, constId) {
        var child = this.$__appendChild(new VElement(tagName, attrs, childCount, constId));

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

    actualize: function(doc) {
        var el;
        var namespaceURI = this.namespaceURI;
        var tagName = this.nodeName;

        if (namespaceURI) {
            el = doc.createElementNS(namespaceURI, tagName);
        } else {
            el = doc.createElement(tagName);
        }

        var attributes = this.$__attributes;
        for (var attrName in attributes) {
            var attrValue = attributes[attrName];

            if (attrName[5] == '_' && specialAttrRegexp.test(attrName)) {
                continue;
            }

            if (attrValue !== false && attrValue != null) {
                var type = typeof attrValue;

                if (type !== 'string') {
                    // Special attributes aren't copied to the real DOM. They are only
                    // kept in the virtual attributes map
                    attrValue = convertAttrValue(type, attrValue);
                }

                if (attrName === ATTR_XLINK_HREF) {
                    el.setAttributeNS(NS_XLINK, ATTR_HREF, attrValue);
                } else {
                    el.setAttribute(attrName, attrValue);
                }
            }
        }

        if (this.$__isTextArea) {
            el.value = this.$__value;
        } else {
            var curChild = this.firstChild;

            while(curChild) {
                el.appendChild(curChild.actualize(doc));
                curChild = curChild.nextSibling;
            }
        }

        el._vattrs = attributes;

        return el;
    },

    hasAttributeNS: function(namespaceURI, name) {
        // We don't care about the namespaces since the there
        // is no chance that attributes with the same name will have
        // different namespaces
        var value = this.$__attributes[name];
        return value != null && value !== false;
    },

    getAttribute: function(name) {
        return this.$__attributes[name];
    },

    isSameNode: function(otherNode) {
        if (otherNode.nodeType == 1) {
            var constId = this.$__constId;
            if (constId) {
                var otherSameId = otherNode.$__VNode ? otherNode.$__constId : otherNode.getAttribute(ATTR_MARKO_CONST);
                return constId === otherSameId;
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
        return value != null ? value.toString() : '';
    }
});

VElement.$__morphAttrs = function(fromEl, toEl) {
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
        if (oldAttrs === attrs) {
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

    // In some cases we only want to set an attribute value for the first
    // render or we don't want certain attributes to be touched. To support
    // that use case we delete out all of the preserved attributes
    // so it's as if they never existed.
    attrs = removePreservedAttributes(attrs, true);

    // Loop over all of the attributes in the attribute map and compare
    // them to the value in the old map. However, if the value is
    // null/undefined/false then we want to remove the attribute
    for (attrName in attrs) {
        var attrValue = attrs[attrName];

        if (attrName == ATTR_XLINK_HREF) {
            if (attrValue == null || attrValue === false) {
                fromEl.removeAttributeNS(NS_XLINK, ATTR_HREF);
            } else if (oldAttrs[attrName] != attrValue) {
                fromEl.setAttributeNS(NS_XLINK, ATTR_HREF, attrValue);
            }
        } else {
            if (attrValue == null || attrValue === false) {
                fromEl.removeAttribute(attrName);
            } else if (oldAttrs[attrName] !== attrValue) {

                if (attrName[5] == '_' && specialAttrRegexp.test(attrName)) {
                    // Special attributes aren't copied to the real DOM. They are only
                    // kept in the virtual attributes map
                    continue;
                }

                var type = typeof attrValue;

                if (type !== 'string') {
                    attrValue = convertAttrValue(type, attrValue);
                }

                fromEl.setAttribute(attrName, attrValue);
            }
        }
    }

    // If there are any old attributes that are not in the new set of attributes
    // then we need to remove those attributes from the target node
    for (attrName in oldAttrs) {
        if (!(attrName in attrs)) {
            if (attrName == ATTR_XLINK_HREF) {
                fromEl.removeAttributeNS(NS_XLINK, ATTR_HREF);
            } else {
                fromEl.removeAttribute(attrName);
            }
        }
    }

    fromEl._vattrs = attrs;
};

module.exports = VElement;

});
$_mod.installed("marko$4.0.0-rc.18", "morphdom", "2.3.1");
$_mod.def("/morphdom$2.3.1/dist/morphdom-factory", function(require, exports, module, __filename, __dirname) { 'use strict';

var range; // Create a range object for efficently rendering strings to elements.
var NS_XHTML = 'http://www.w3.org/1999/xhtml';

var doc = typeof document === 'undefined' ? undefined : document;

var testEl = doc ?
    doc.body || doc.createElement('div') :
    {};

// Fixes <https://github.com/patrick-steele-idem/morphdom/issues/32>
// (IE7+ support) <=IE7 does not support el.hasAttribute(name)
var actualHasAttributeNS;

if (testEl.hasAttributeNS) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttributeNS(namespaceURI, name);
    };
} else if (testEl.hasAttribute) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttribute(name);
    };
} else {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.getAttributeNode(namespaceURI, name) != null;
    };
}

var hasAttributeNS = actualHasAttributeNS;


function toElement(str) {
    if (!range && doc.createRange) {
        range = doc.createRange();
        range.selectNode(doc.body);
    }

    var fragment;
    if (range && range.createContextualFragment) {
        fragment = range.createContextualFragment(str);
    } else {
        fragment = doc.createElement('body');
        fragment.innerHTML = str;
    }
    return fragment.childNodes[0];
}

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
    var fromNodeName = fromEl.nodeName;
    var toNodeName = toEl.nodeName;

    if (fromNodeName === toNodeName) {
        return true;
    }

    if (toEl.actualize &&
        fromNodeName.charCodeAt(0) < 91 && /* from tag name is upper case */
        toNodeName.charCodeAt(0) > 90 /* target tag name is lower case */) {
        // If the target element is a virtual DOM node then we may need to normalize the tag name
        // before comparing. Normal HTML elements that are in the "http://www.w3.org/1999/xhtml"
        // are converted to upper case
        return fromNodeName === toNodeName.toUpperCase();
    } else {
        return false;
    }
}

/**
 * Create an element, optionally with a known namespace URI.
 *
 * @param {string} name the element name, e.g. 'div' or 'svg'
 * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
 * its `xmlns` attribute or its inferred namespace.
 *
 * @return {Element}
 */
function createElementNS(name, namespaceURI) {
    return !namespaceURI || namespaceURI === NS_XHTML ?
        doc.createElement(name) :
        doc.createElementNS(namespaceURI, name);
}

/**
 * Copies the children of one DOM element to another DOM element
 */
function moveChildren(fromEl, toEl) {
    var curChild = fromEl.firstChild;
    while (curChild) {
        var nextChild = curChild.nextSibling;
        toEl.appendChild(curChild);
        curChild = nextChild;
    }
    return toEl;
}

function syncBooleanAttrProp(fromEl, toEl, name) {
    if (fromEl[name] !== toEl[name]) {
        fromEl[name] = toEl[name];
        if (fromEl[name]) {
            fromEl.setAttribute(name, '');
        } else {
            fromEl.removeAttribute(name, '');
        }
    }
}

var specialElHandlers = {
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

        if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
        }

        if (!hasAttributeNS(toEl, null, 'value')) {
            fromEl.removeAttribute('value');
        }
    },

    TEXTAREA: function(fromEl, toEl) {
        var newValue = toEl.value;
        if (fromEl.value !== newValue) {
            fromEl.value = newValue;
        }

        if (fromEl.firstChild) {
            // Needed for IE. Apparently IE sets the placeholder as the
            // node value and vise versa. This ignores an empty update.
            if (newValue === '' && fromEl.firstChild.nodeValue === fromEl.placeholder) {
                return;
            }

            fromEl.firstChild.nodeValue = newValue;
        }
    },
    SELECT: function(fromEl, toEl) {
        if (!hasAttributeNS(toEl, null, 'multiple')) {
            var selectedIndex = -1;
            var i = 0;
            var curChild = toEl.firstChild;
            while(curChild) {
                var nodeName = curChild.nodeName;
                if (nodeName && nodeName.toUpperCase() === 'OPTION') {
                    if (hasAttributeNS(curChild, null, 'selected')) {
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

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

function noop() {}

function defaultGetNodeKey(node) {
    return node.id;
}

function morphdomFactory(morphAttrs) {

    return function morphdom(fromNode, toNode, options) {
        if (!options) {
            options = {};
        }

        if (typeof toNode === 'string') {
            if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML') {
                var toNodeHtml = toNode;
                toNode = doc.createElement('html');
                toNode.innerHTML = toNodeHtml;
            } else {
                toNode = toElement(toNode);
            }
        }

        var getNodeKey = options.getNodeKey || defaultGetNodeKey;
        var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
        var onNodeAdded = options.onNodeAdded || noop;
        var onBeforeElUpdated = options.onBeforeElUpdated || noop;
        var onElUpdated = options.onElUpdated || noop;
        var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
        var onNodeDiscarded = options.onNodeDiscarded || noop;
        var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
        var childrenOnly = options.childrenOnly === true;

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
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {

                    var key = undefined;

                    if (skipKeyedNodes && (key = getNodeKey(curChild))) {
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
            if (onBeforeNodeDiscarded(node) === false) {
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
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {
                    var key = getNodeKey(curChild);
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

        function handleNodeAdded(el) {
            onNodeAdded(el);

            var curChild = el.firstChild;
            while (curChild) {
                var nextSibling = curChild.nextSibling;

                var key = getNodeKey(curChild);
                if (key) {
                    var unmatchedFromEl = fromNodesLookup[key];
                    if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
                        curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
                        morphEl(unmatchedFromEl, curChild);
                    }
                }

                handleNodeAdded(curChild);
                curChild = nextSibling;
            }
        }

        function morphEl(fromEl, toEl, childrenOnly) {
            var toElKey = getNodeKey(toEl);
            var curFromNodeKey;

            if (toElKey) {
                // If an element with an ID is being morphed then it is will be in the final
                // DOM so clear it out of the saved elements collection
                delete fromNodesLookup[toElKey];
            }

            if (toNode.isSameNode && toNode.isSameNode(fromNode)) {
                return;
            }

            if (!childrenOnly) {
                if (onBeforeElUpdated(fromEl, toEl) === false) {
                    return;
                }

                morphAttrs(fromEl, toEl);
                onElUpdated(fromEl);

                if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
                    return;
                }
            }

            if (fromEl.nodeName !== 'TEXTAREA') {
                var curToNodeChild = toEl.firstChild;
                var curFromNodeChild = fromEl.firstChild;
                var curToNodeKey;

                var fromNextSibling;
                var toNextSibling;
                var matchingFromEl;

                outer: while (curToNodeChild) {
                    toNextSibling = curToNodeChild.nextSibling;
                    curToNodeKey = getNodeKey(curToNodeChild);

                    while (curFromNodeChild) {
                        fromNextSibling = curFromNodeChild.nextSibling;

                        if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        curFromNodeKey = getNodeKey(curFromNodeChild);

                        var curFromNodeType = curFromNodeChild.nodeType;

                        var isCompatible = undefined;

                        if (curFromNodeType === curToNodeChild.nodeType) {
                            if (curFromNodeType === ELEMENT_NODE) {
                                // Both nodes being compared are Element nodes

                                if (curToNodeKey) {
                                    // The target node has a key so we want to match it up with the correct element
                                    // in the original DOM tree
                                    if (curToNodeKey !== curFromNodeKey) {
                                        // The current element in the original DOM tree does not have a matching key so
                                        // let's check our lookup to see if there is a matching element in the original
                                        // DOM tree
                                        if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                            if (curFromNodeChild.nextSibling === matchingFromEl) {
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

                                isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
                                if (isCompatible) {
                                    // We found compatible DOM elements so transform
                                    // the current "from" node to match the current
                                    // target DOM node.
                                    morphEl(curFromNodeChild, curToNodeChild);
                                }

                            } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
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
                        morphEl(matchingFromEl, curToNodeChild);
                    } else {
                        var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
                        if (onBeforeNodeAddedResult !== false) {
                            if (onBeforeNodeAddedResult) {
                                curToNodeChild = onBeforeNodeAddedResult;
                            }

                            if (curToNodeChild.actualize) {
                                curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
                            }
                            fromEl.appendChild(curToNodeChild);
                            handleNodeAdded(curToNodeChild);
                        }
                    }

                    curToNodeChild = toNextSibling;
                    curFromNodeChild = fromNextSibling;
                }

                // We have processed all of the "to nodes". If curFromNodeChild is
                // non-null then we still have some from nodes left over that need
                // to be removed
                while (curFromNodeChild) {
                    fromNextSibling = curFromNodeChild.nextSibling;
                    if ((curFromNodeKey = getNodeKey(curFromNodeChild))) {
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
        var morphedNodeType = morphedNode.nodeType;
        var toNodeType = toNode.nodeType;

        if (!childrenOnly) {
            // Handle the case where we are given two DOM nodes that are not
            // compatible (e.g. <div> --> <span> or <div> --> TEXT)
            if (morphedNodeType === ELEMENT_NODE) {
                if (toNodeType === ELEMENT_NODE) {
                    if (!compareNodeNames(fromNode, toNode)) {
                        onNodeDiscarded(fromNode);
                        morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
                    }
                } else {
                    // Going from an element node to a text node
                    morphedNode = toNode;
                }
            } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) { // Text or comment node
                if (toNodeType === morphedNodeType) {
                    morphedNode.nodeValue = toNode.nodeValue;
                    return morphedNode;
                } else {
                    // Text node to something else
                    morphedNode = toNode;
                }
            }
        }

        if (morphedNode === toNode) {
            // The "to node" was not compatible with the "from node" so we had to
            // toss out the "from node" and use the "to node"
            onNodeDiscarded(fromNode);
        } else {
            morphEl(morphedNode, toNode, childrenOnly);

            // We now need to loop over any keyed nodes that might need to be
            // removed. We only do the removal if we know that the keyed node
            // never found a match. When a keyed node is matched up we remove
            // it out of fromNodesLookup and we use fromNodesLookup to determine
            // if a keyed node has been matched up or not
            if (keyedRemovalList) {
                for (var i=0, len=keyedRemovalList.length; i<len; i++) {
                    var elToRemove = fromNodesLookup[keyedRemovalList[i]];
                    if (elToRemove) {
                        removeNode(elToRemove, elToRemove.parentNode, false);
                    }
                }
            }
        }

        if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
            if (morphedNode.actualize) {
                morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
            }
            // If we had to swap out the from node with a new node because the old
            // node was not compatible with the target node then we need to
            // replace the old DOM node in the original DOM tree. This is only
            // possible if the original DOM node was part of a DOM tree which
            // we know is the case if it has a parent node.
            fromNode.parentNode.replaceChild(morphedNode, fromNode);
        }

        return morphedNode;
    };
}

module.exports = morphdomFactory;

});
$_mod.def("/morphdom$2.3.1/factory", function(require, exports, module, __filename, __dirname) { module.exports = require('/morphdom$2.3.1/dist/morphdom-factory'/*'./dist/morphdom-factory'*/);
});
$_mod.def("/marko$4.0.0-rc.18/widgets/Widget", function(require, exports, module, __filename, __dirname) { 'use strict';
/* jshint newcap:false */

var domInsert = require('/marko$4.0.0-rc.18/runtime/dom-insert'/*'../runtime/dom-insert'*/);
var marko = require('/marko$4.0.0-rc.18/runtime/index'/*'../'*/);
var widgetsUtil = require('/marko$4.0.0-rc.18/widgets/util-browser'/*'./util'*/);
var getWidgetForEl = widgetsUtil.$__getWidgetForEl;
var widgetLookup = widgetsUtil.$__widgetLookup;
var emitLifecycleEvent = widgetsUtil.$__emitLifecycleEvent;
var destroyWidgetForEl = widgetsUtil.$__destroyWidgetForEl;
var destroyElRecursive = widgetsUtil.$__destroyElRecursive;
var getElementById = widgetsUtil.$__getElementById;
var EventEmitter = require('/events-light$1.0.5/src/index'/*'events-light'*/);
var RenderResult = require('/marko$4.0.0-rc.18/runtime/RenderResult'/*'../runtime/RenderResult'*/);
var SubscriptionTracker = require('/listener-tracker$2.0.0/lib/listener-tracker'/*'listener-tracker'*/);
var inherit = require('/raptor-util$3.1.0/inherit'/*'raptor-util/inherit'*/);
var updateManager = require('/marko$4.0.0-rc.18/widgets/update-manager'/*'./update-manager'*/);
var morphAttrs = require('/marko$4.0.0-rc.18/runtime/vdom/VElement'/*'../runtime/vdom/VElement'*/).$__morphAttrs;
var morphdomFactory = require('/morphdom$2.3.1/factory'/*'morphdom/factory'*/);
var morphdom = morphdomFactory(morphAttrs);
var eventDelegation = require('/marko$4.0.0-rc.18/widgets/event-delegation'/*'./event-delegation'*/);

var slice = Array.prototype.slice;

var MORPHDOM_SKIP = false;

var WIDGET_SUBSCRIBE_TO_OPTIONS;
var NON_WIDGET_SUBSCRIBE_TO_OPTIONS = {
    addDestroyListener: false
};

var emit = EventEmitter.prototype.emit;

function removeListener(removeEventListenerHandle) {
    removeEventListenerHandle();
}

function hasCompatibleWidget(widgetsContext, existingWidget) {
    var id = existingWidget.id;
    var newWidgetDef = widgetsContext.$__widgetsById[id];
    return newWidgetDef && existingWidget.$__type == newWidgetDef.$__widget.$__type;
}

function handleCustomEventWithMethodListener(widget, targetMethodName, args, extraArgs) {
    // Remove the "eventType" argument
    args.push(widget);

    if (extraArgs) {
        args = extraArgs.concat(args);
    }


    var targetWidget = widgetLookup[widget.$__scope];
    var targetMethod = targetWidget[targetMethodName];
    if (!targetMethod) {
        throw Error('Method not found: ' + targetMethodName);
    }

    targetMethod.apply(targetWidget, args);
}

function getElIdHelper(widget, widgetElId, index) {
    var id = widget.id;

    var elId = widgetElId != null ? id + '-' + widgetElId : id;

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
function processUpdateHandlers(widget, stateChanges, oldState) {
    var handlerMethod;
    var handlers;

    for (var propName in stateChanges) {
        if (stateChanges.hasOwnProperty(propName)) {
            var handlerMethodName = 'update_' + propName;

            handlerMethod = widget[handlerMethodName];
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

        for (var i=0, len=handlers.length; i<len; i++) {
            var handler = handlers[i];
            var propertyName = handler[0];
            handlerMethod = handler[1];

            var newValue = stateChanges[propertyName];
            var oldValue = oldState[propertyName];
            handlerMethod.call(widget, newValue, oldValue);
        }

        emitLifecycleEvent(widget, 'update');

        widget.$__reset();
    }

    return true;
}

function checkInputChanged(existingWidget, oldInput, newInput) {
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

function handleNodeDiscarded(node) {
    if (node.nodeType == 1) {
        destroyWidgetForEl(node);
    }
}

function handleBeforeNodeDiscarded(node) {
    return eventDelegation.$__handleNodeDetach(node);
}

var widgetProto;

/**
 * Base widget type.
 *
 * NOTE: Any methods that are prefixed with an underscore should be considered private!
 */
function Widget(id, doc) {
    EventEmitter.call(this);
    this.id = id;
    this.el =
        this.$__state =
        this.$__roots =
        this.$__subscriptions =
        this.$__domEventListenerHandles =
        this.$__bubblingDomEvents =
        this.$__customEvents =
        this.$__scope =
        this.$__renderInput =
        null;

    this.$__destroyed =
        this.$__updateQueued =
        this.$__dirty =
        this.$__settingInput =
        false;

    this.$__document = doc;
}

Widget.prototype = widgetProto = {
    $__isWidget: true,

    subscribeTo: function(target) {
        if (!target) {
            throw TypeError();
        }

        var subscriptions = this.$__subscriptions || (this.$__subscriptions = new SubscriptionTracker());

        var subscribeToOptions = target.$__isWidget ?
            WIDGET_SUBSCRIBE_TO_OPTIONS :
            NON_WIDGET_SUBSCRIBE_TO_OPTIONS;

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
    getElId: function (widgetElId, index) {
        return getElIdHelper(this, widgetElId, index);
    },
    getEl: function (widgetElId, index) {
        var doc = this.$__document;

        if (widgetElId != null) {
            return getElementById(doc, getElIdHelper(this, widgetElId, index));
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
    getWidget: function(id, index) {
        return widgetLookup[getElIdHelper(this, id, index)];
    },
    getWidgets: function(id) {
        var widgets = [];
        var i = 0;
        var widget;
        while((widget = widgetLookup[getElIdHelper(this, id, i)])) {
            widgets.push(widget);
            i++;
        }
        return widgets;
    },
    destroy: function() {
        if (this.$__destroyed) {
            return;
        }

        var i, len;

        var els = this.els;

        this.$__destroyShallow();

        var rootWidgets = this.$__rootWidgets;
        if (rootWidgets) {
            for (i=0, len=rootWidgets.length; i<len; i++) {
                rootWidgets[i].destroy();
            }
        }

        for (i=0, len=els.length; i<len; i++) {
            var el = els[i];
            destroyElRecursive(el);

            var parentNode = el.parentNode;
            if (parentNode) {
                parentNode.removeChild(el);
            }
        }
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

        delete widgetLookup[this.id];
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
            updateManager.$__queueWidgetUpdate(this);
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
                this.doUpdate();
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

    doUpdate: function() {
        this.rerender();
    },

    $__emitLifecycleEvent: function(eventType, eventArg1, eventArg2) {
        emitLifecycleEvent(this, eventType, eventArg1, eventArg2);
    },

    rerender: function(input) {
        if (input) {
            this.input = input;
        }

        var self = this;
        var renderer = self.renderer;

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

            var widgetsContext = out.global.widgets;

            function onBeforeElUpdated(fromEl, toEl) {
                var id = fromEl.id;
                var existingWidget;

                if (widgetsContext && id) {
                    var preserved = widgetsContext.$__preserved[id];

                    if (preserved && !preserved.$__bodyOnly) {
                        // Don't morph elements that are associated with widgets that are being
                        // reused or elements that are being preserved. For widgets being reused,
                        // the morphing will take place when the reused widget updates.
                        return MORPHDOM_SKIP;
                    } else {
                        existingWidget = getWidgetForEl(fromEl);
                        if (existingWidget && !hasCompatibleWidget(widgetsContext, existingWidget)) {
                            // We found a widget in an old DOM node that does not have
                            // a compatible widget that was rendered so we need to
                            // destroy the old widget
                            existingWidget.$__destroyShallow();
                        }
                    }
                }
            }

            function onBeforeElChildrenUpdated(el) {
                var id = el.id;
                if (widgetsContext && id) {
                    var preserved = widgetsContext.$__preserved[id];
                    if (preserved && preserved.$__bodyOnly) {
                        // Don't morph the children since they are preserved
                        return MORPHDOM_SKIP;
                    }
                }
            }

            function handleNodeAdded(node) {
                eventDelegation.$__handleNodeAttach(node, out);
            }

            var morphdomOptions = {
                onBeforeNodeDiscarded: handleBeforeNodeDiscarded,
                onNodeDiscarded: handleNodeDiscarded,
                onNodeAdded: handleNodeAdded,
                onBeforeElUpdated: onBeforeElUpdated,
                onBeforeElChildrenUpdated: onBeforeElChildrenUpdated
            };

            var fromEl;

            var targetEl = targetNode.firstChild;
            while(targetEl) {
                var id = targetEl.id;

                if (id) {
                    fromEl = fromEls[id];
                    if (fromEl) {
                        morphdom(fromEl, targetEl, morphdomOptions);
                    }
                }

                targetEl = targetEl.nextSibling;
            }

            result.afterInsert(doc);

            out.emit('$__widgetsInitialized');
        });
    },

    $__getRootEls: function(rootEls) {
        var i, len;

        var widgetEls = this.els;

        for (i=0, len=widgetEls.length; i<len; i++) {
            var widgetEl = widgetEls[i];
            rootEls[widgetEl.id] = widgetEl;
        }

        var rootWidgets = this.$__rootWidgets;
        if (rootWidgets) {
            for (i=0, len=rootWidgets.length; i<len; i++) {
                var rootWidget = rootWidgets[i];
                rootWidget.$__getRootEls(rootEls);
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
    }
};

widgetProto.elId = widgetProto.getElId;

// Add all of the following DOM methods to Widget.prototype:
// - appendTo(referenceEl)
// - replace(referenceEl)
// - replaceChildrenOf(referenceEl)
// - insertBefore(referenceEl)
// - insertAfter(referenceEl)
// - prependTo(referenceEl)
domInsert(
    widgetProto,
    function getEl(widget) {
        var els = this.els;
        var elCount = els.length;
        if (elCount > 1) {
            var fragment = widget.$__document.createDocumentFragment();
            for (var i=0; i<elCount; i++) {
                fragment.appendChild(els[i]);
            }
            return fragment;
        } else {
            return els[0];
        }
    },
    function afterInsert(widget) {
        return widget;
    });

inherit(Widget, EventEmitter);

module.exports = Widget;

});
$_mod.def("/marko$4.0.0-rc.18/widgets/defineWidget", function(require, exports, module, __filename, __dirname) { 'use strict';
/* jshint newcap:false */

 var BaseState;
 var BaseWidget;
 var inherit;

module.exports = function defineWidget(def, renderer) {
    if (def.$__isWidget) {
        return def;
    }

    var WidgetClass;
    var proto;

    if (typeof def === 'function') {
        WidgetClass = def;
        proto = WidgetClass.prototype;
    } else if (typeof def === 'object') {
        WidgetClass = function() {};
        proto = WidgetClass.prototype = def;
    } else {
        throw TypeError();
    }

    // We don't use the constructor provided by the user
    // since we don't invoke their constructor until
    // we have had a chance to do our own initialization.
    // Instead, we store their constructor in the "initWidget"
    // property and that method gets called later inside
    // init-widgets-browser.js
    function Widget(id, doc) {
        BaseWidget.call(this, id, doc);
    }

    if (!proto.$__isWidget) {
        // Inherit from Widget if they didn't already
        inherit(WidgetClass, BaseWidget);
    }

    // The same prototype will be used by our constructor after
    // we he have set up the prototype chain using the inherit function
    proto = Widget.prototype = WidgetClass.prototype;

    proto.onCreate = proto.onCreate || WidgetClass;

    proto.constructor = def.constructor = Widget;

    // Set a flag on the constructor function to make it clear this is
    // a widget so that we can short-circuit this work later
    Widget.$__isWidget = true;

    function State() { BaseState.apply(this, arguments); }
    inherit(State, BaseState);
    proto.$__State = State;
    proto.renderer = renderer;

    return Widget;
};

BaseState = require('/marko$4.0.0-rc.18/widgets/State'/*'./State'*/);
BaseWidget = require('/marko$4.0.0-rc.18/widgets/Widget'/*'./Widget'*/);
inherit = require('/raptor-util$3.1.0/inherit'/*'raptor-util/inherit'*/);
});
$_mod.def("/marko$4.0.0-rc.18/widgets/registry-browser", function(require, exports, module, __filename, __dirname) { var loadWidget = require('/marko$4.0.0-rc.18/widgets/loadWidget-dynamic'/*'./loadWidget'*/);
var defineWidget = require('/marko$4.0.0-rc.18/widgets/defineWidget'/*'./defineWidget'*/);

var registered = {};
var loaded = {};
var widgetTypes = {};

function register(typeName, def) {
    if (typeof def === 'function') {
        // We do this to kick off registering of nested widgets
        // but we don't use the return value just yet since there
        // is a good chance that it resulted in a circular dependency
        def();
    }

    registered[typeName] = def;
    delete loaded[typeName];
    delete widgetTypes[typeName];
    return typeName;
}

function load(typeName) {
    var target = loaded[typeName];
    if (target === undefined) {
        target = registered[typeName];

        if (typeof target === 'function') {
            target = target();
        }
        if (!target) {
            target = loadWidget(typeName); // Assume the typeName has been fully resolved already
        }
        loaded[typeName] = target || null;
    }

    if (target == null) {
        throw new Error('Unable to load: ' + typeName);
    }
    return target;
}

function getWidgetClass(typeName) {
    var WidgetClass = widgetTypes[typeName];

    if (WidgetClass) {
        return WidgetClass;
    }

    WidgetClass = load(typeName);

    if (WidgetClass.Widget) {
        WidgetClass = WidgetClass.Widget;
    }

    if (!WidgetClass.$__isWidget) {
        WidgetClass = defineWidget(WidgetClass, WidgetClass.renderer);
    }

    // Make the widget "type" accessible on each widget instance
    WidgetClass.prototype.$__type = typeName;

    widgetTypes[typeName] = WidgetClass;

    return WidgetClass;
}

function createWidget(typeName, id) {
    var WidgetClass = getWidgetClass(typeName);
    var widget;
    if (typeof WidgetClass === 'function') {
        // The widget is a constructor function that we can invoke to create a new instance of the widget
        widget = new WidgetClass(id);
    } else if (WidgetClass.initWidget) {
        widget = WidgetClass;
    }
    return widget;
}

exports.$__register = register;
exports.$__createWidget = createWidget;

});
$_mod.def("/marko$4.0.0-rc.18/widgets/WidgetDef", function(require, exports, module, __filename, __dirname) { 'use strict';
var nextRepeatedId = require('/marko$4.0.0-rc.18/widgets/nextRepeatedId'/*'./nextRepeatedId'*/);
var repeatedRegExp = /\[\]$/;
var widgetUtil = require('/marko$4.0.0-rc.18/widgets/util-browser'/*'./util'*/);
var nextWidgetId = widgetUtil.$__nextWidgetId;
var attachBubblingEvent = widgetUtil.$__attachBubblingEvent;

var extend = require('/raptor-util$3.1.0/extend'/*'raptor-util/extend'*/);
var registry = require('/marko$4.0.0-rc.18/widgets/registry-browser'/*'./registry'*/);

/**
 * A WidgetDef is used to hold the metadata collected at runtime for
 * a single widget and this information is used to instantiate the widget
 * later (after the rendered HTML has been added to the DOM)
 */
function WidgetDef(widget, widgetId, out, widgetStack, widgetStackLen) {
    this.$__out = out; // The AsyncWriter that this widget is associated with
    this.$__widgetStack = widgetStack;
    this.$__widgetStackLen = widgetStackLen;
    this.$__widget = widget;
    this.id = widgetId;

    this.$__scope =         // The ID of the widget that this widget is scoped within
        this.$__customEvents =  // An array containing information about custom events
        this.$__roots =         // IDs of root elements if there are multiple root elements
        this.$__children = // An array of nested WidgetDef instances
        this.$__domEvents = // An array of DOM events that need to be added (in sets of three)
        this.$__bubblingDomEvents = // Used to keep track of bubbling DOM events for widgets rendered on the server
        undefined;

    this.$__isExisting = false;

    this.$__nextIdIndex = 0; // The unique integer to use for the next scoped ID
}

WidgetDef.prototype = {
    $__end: function() {
        this.$__widgetStack.length = this.$__widgetStackLen;
    },

    /**
     * Register a nested widget for this widget. We maintain a tree of widgets
     * so that we can instantiate nested widgets before their parents.
     */
    $__addChild: function (widgetDef) {
        var children = this.$__children;

        if (children) {
            children.push(widgetDef);
        } else {
            this.$__children = [widgetDef];
        }
    },
    /**
     * This helper method generates a unique and fully qualified DOM element ID
     * that is unique within the scope of the current widget. This method prefixes
     * the the nestedId with the ID of the current widget. If nestedId ends
     * with `[]` then it is treated as a repeated ID and we will generate
     * an ID with the current index for the current nestedId.
     * (e.g. "myParentId-foo[0]", "myParentId-foo[1]", etc.)
     */
    elId: function (nestedId) {
        if (nestedId == null) {
            return this.id;
        } else {
            if (typeof nestedId === 'string' && repeatedRegExp.test(nestedId)) {
                return nextRepeatedId(this.$__out, this.id, nestedId);
            } else {
                return this.id + '-' + nestedId;
            }
        }
    },
    /**
     * Registers a DOM event for a nested HTML element associated with the
     * widget. This is only done for non-bubbling events that require
     * direct event listeners to be added.
     * @param  {String} type The DOM event type ("mouseover", "mousemove", etc.)
     * @param  {String} targetMethod The name of the method to invoke on the scoped widget
     * @param  {String} elId The DOM element ID of the DOM element that the event listener needs to be added too
     */
     e: function(type, targetMethod, elId, extraArgs) {
        if (!targetMethod) {
            // The event handler method is allowed to be conditional. At render time if the target
            // method is null then we do not attach any direct event listeners.
            return;
        }

        var domEvents = this.$__domEvents;
        this.$__domEvents = (domEvents || (this.$__domEvents = [])).concat([
            type,
            targetMethod,
            elId,
            extraArgs]);
    },
    /**
     * Returns the next auto generated unique ID for a nested DOM element or nested DOM widget
     */
    $__nextId: function() {
        return this.id ?
            this.id + '-w' + (this.$__nextIdIndex++) :
            nextWidgetId(this.$__out);
    },

    d: function(handlerMethodName, extraArgs) {
        return attachBubblingEvent(this, handlerMethodName, extraArgs);
    }
};

WidgetDef.$__deserialize = function(o, types) {
    var id        = o[0];
    var typeName  = types[o[1]];
    var input     = o[2];
    var extra     = o[3];

    var state = extra.s;
    var widgetProps = extra.w;

    var widget = typeName /* legacy */ && registry.$__createWidget(typeName, id);

    if (extra.b) {
        widget.$__bubblingDomEvents = extra.b;
    }


    // Preview newly created widget from being queued for update since we area
    // just building it from the server info
    widget.$__updateQueued = true;

    if (state) {
        var undefinedPropNames = extra.u;
        if (undefinedPropNames) {
            for(var i=0; i<undefinedPropNames.length; i++) {
                state[undefinedPropNames[i]] = undefined;
            }
        }
        // We go through the setter here so that we convert the state object
        // to an instance of `State`
        widget.state = state;
    }

    widget.$__input = input;

    if (widgetProps) {
        extend(widget, widgetProps);
    }

    return {
        $__widget: widget,
        $__roots: extra.r,
        $__scope: extra.p,
        $__domEvents: extra.d,
        $__customEvents: extra.e
    };
};

module.exports = WidgetDef;
});
$_mod.def("/marko$4.0.0-rc.18/widgets/init-widgets-browser", function(require, exports, module, __filename, __dirname) { 'use strict';
var warp10Finalize = require('/warp10$1.3.3/finalize'/*'warp10/finalize'*/);
var eventDelegation = require('/marko$4.0.0-rc.18/widgets/event-delegation'/*'./event-delegation'*/);
var win = window;
var defaultDocument = document;
var events = require('/marko$4.0.0-rc.18/runtime/events'/*'../runtime/events'*/);
var widgetsUtil = require('/marko$4.0.0-rc.18/widgets/util-browser'/*'./util'*/);
var widgetLookup = widgetsUtil.$__widgetLookup;
var getElementById = widgetsUtil.$__getElementById;
var WidgetDef = require('/marko$4.0.0-rc.18/widgets/WidgetDef'/*'./WidgetDef'*/);
// var extend = require('raptor-util/extend');
// var registry = require('./registry');

function invokeWidgetEventHandler(widget, targetMethodName, args) {
    var method = widget[targetMethodName];
    if (!method) {
        throw Error('Method not found: ' + targetMethodName);
    }

    method.apply(widget, args);
}

function addEventListenerHelper(el, eventType, listener) {
    el.addEventListener(eventType, listener, false);
    return function remove() {
        el.removeEventListener(eventType, listener);
    };
}

function addDOMEventListeners(widget, el, eventType, targetMethodName, extraArgs, handles) {
    var removeListener = addEventListenerHelper(el, eventType, function(event) {
        var args = [event, el];
        if (extraArgs) {
            args = extraArgs.concat(args);
        }

        invokeWidgetEventHandler(widget, targetMethodName, args);
    });
    handles.push(removeListener);
}

function initWidget(widgetDef, doc) {
    var widget = widgetDef.$__widget;

    if (!widget || !widget.$__isWidget) {
        return; // legacy
    }

    var scope = widgetDef.$__scope;
    var domEvents = widgetDef.$__domEvents;
    var customEvents = widgetDef.$__customEvents;

    widget.$__reset();
    widget.$__document = doc;

    var isExisting = widgetDef.$__isExisting;
    var i;
    var len;
    var eventType;
    var targetMethodName;
    var extraArgs;
    var id = widget.id;

    var rootIds = widgetDef.$__roots;

    if (rootIds) {
        var rootWidgets;

        var els = [];
        for (i=0, len=rootIds.length; i<len; i++) {
            var rootId = rootIds[i];
            var nestedId = id + '-' + rootId;
            var rootWidget = widgetLookup[nestedId];
            if (rootWidget) {
                rootWidget.$__rootFor = widget;
                if (rootWidgets) {
                    rootWidgets.push(rootWidget);
                } else {
                    rootWidgets = widget.$__rootWidgets = [rootWidget];
                }
            } else {
                var rootEl = getElementById(doc, nestedId);
                if (rootEl) {
                    rootEl._w = widget;
                    els.push(rootEl);
                }
            }
        }

        widget.el = els[0];
        widget.els = els;
        widgetLookup[id] = widget;
    } else if (!isExisting) {
        var el = getElementById(doc, id);
        el._w = widget;
        widget.el = el;
        widget.els = [el];
        widgetLookup[id] = widget;
    }

    if (isExisting) {
        widget.$__removeDOMEventListeners();
    }

    if (domEvents) {
        var eventListenerHandles = [];

        for (i=0, len=domEvents.length; i<len; i+=4) {
            eventType = domEvents[i];
            targetMethodName = domEvents[i+1];
            var eventEl = getElementById(doc, domEvents[i+2]);
            extraArgs = domEvents[i+3];

            // The event mapping is for a DOM event (not a custom event)
            addDOMEventListeners(widget, eventEl, eventType, targetMethodName, extraArgs, eventListenerHandles);
        }

        if (eventListenerHandles.length) {
            widget.$__domEventListenerHandles = eventListenerHandles;
        }
    }

    if (customEvents) {
        widget.$__customEvents = {};
        widget.$__scope = scope;

        for (i=0, len=customEvents.length; i<len; i+=3) {
            eventType = customEvents[i];
            targetMethodName = customEvents[i+1];
            extraArgs = customEvents[i+2];

            widget.$__customEvents[eventType] = [targetMethodName, extraArgs];
        }
    }

    if (isExisting) {
        widget.$__emitLifecycleEvent('update');
    } else {
        events.emit('mountWidget', widget);
        widget.$__emitLifecycleEvent('mount');
    }
}

/**
 * This method is used to initialized widgets associated with UI components
 * rendered in the browser. While rendering UI components a "widgets context"
 * is added to the rendering context to keep up with which widgets are rendered.
 * When ready, the widgets can then be initialized by walking the widget tree
 * in the widgets context (nested widgets are initialized before ancestor widgets).
 * @param  {Array<marko-widgets/lib/WidgetDef>} widgetDefs An array of WidgetDef instances
 */
function initClientRendered(widgetDefs, doc) {
    // Ensure that event handlers to handle delegating events are
    // always attached before initializing any widgets
    eventDelegation.$__init(doc);

    doc = doc || defaultDocument;
    for (var i=0,len=widgetDefs.length; i<len; i++) {
        var widgetDef = widgetDefs[i];

        if (widgetDef.$__children) {
            initClientRendered(widgetDef.$__children, doc);
        }

        initWidget(
            widgetDef,
            doc);
    }
}

/**
 * This method initializes all widgets that were rendered on the server by iterating over all
 * of the widget IDs.
 */
function initServerRendered(renderedWidgets, doc) {
    var i=0, len;
    if (!arguments.length) {
        renderedWidgets = win.$widgets;

        win.$widgets = {
            concat: initServerRendered
        };

        if (renderedWidgets && (len=renderedWidgets.length)) {
            for (; i<len; i++) {
                initServerRendered(renderedWidgets[i], doc);
            }
        }
        return;
    }
    // Ensure that event handlers to handle delegating events are
    // always attached before initializing any widgets
    eventDelegation.$__init(doc || defaultDocument);

    renderedWidgets = warp10Finalize(renderedWidgets);

    var widgetDefs = renderedWidgets.w;
    var typesArray = renderedWidgets.t;

    if (!doc) {
        doc = defaultDocument;
    }

    for (len=widgetDefs.length; i<len; i++) {
        var widgetDef = WidgetDef.$__deserialize(widgetDefs[i], typesArray);
        initWidget(widgetDef, doc);
    }
}

exports.$__initClientRendered = initClientRendered;
exports.$__initServerRendered = initServerRendered;
});
$_mod.def("/marko$4.0.0-rc.18/widgets/boot", function(require, exports, module, __filename, __dirname) { require('/marko$4.0.0-rc.18/widgets/init-widgets-browser'/*'./init-widgets'*/).$__initServerRendered();
});
$_mod.run("/marko$4.0.0-rc.18/widgets/boot");
$_mod.def("/marko$4.0.0-rc.18/widgets/WidgetsContext", function(require, exports, module, __filename, __dirname) { 'use strict';

var WidgetDef = require('/marko$4.0.0-rc.18/widgets/WidgetDef'/*'./WidgetDef'*/);
var initWidgets = require('/marko$4.0.0-rc.18/widgets/init-widgets-browser'/*'./init-widgets'*/);
var EMPTY_OBJECT = {};

function WidgetsContext(out, root) {
    if (!root) {
        root = new WidgetDef(null, null, out);
    }

    this.$__out = out;
    this.$__widgetStack = [root];
    this.$__preserved = EMPTY_OBJECT;
    this.$__widgetsById = {};
}

WidgetsContext.prototype = {
    get $__widgets() {
        return this.$__widgetStack[0].$__children;
    },

    $__beginWidget: function(widget) {
        var self = this;
        var widgetStack = self.$__widgetStack;
        var origLength = widgetStack.length;
        var parent = widgetStack[origLength - 1];

        var widgetId = widget.id;

        if (!widgetId) {
            widgetId = widget.id = parent.$__nextId();
        }

        var widgetDef = new WidgetDef(widget, widgetId, this.$__out, widgetStack, origLength);
        this.$__widgetsById[widgetId] = widgetDef;
        parent.$__addChild(widgetDef);
        widgetStack.push(widgetDef);

        return widgetDef;
    },
    $__clearWidgets: function () {
        this.$__widgetStack = [new WidgetDef(null /* id */, this.$__out)];
    },
    $__initWidgets: function (doc) {
        var widgetDefs = this.$__widgets;
        if (widgetDefs) {
            initWidgets.$__initClientRendered(widgetDefs, doc);
            this.$__clearWidgets();
        }
    },
    $__nextWidgetId: function() {
        var widgetStack = this.$__widgetStack;
        var parent = widgetStack[widgetStack.length - 1];
        return parent.$__nextId();
    },
    $__preserveDOMNode: function(elId, bodyOnly) {
        var preserved = this.$__preserved ;
        if (preserved === EMPTY_OBJECT) {
            preserved = this.$__preserved = {};
        }
        preserved[elId] = { $__bodyOnly: bodyOnly };
    }
};

WidgetsContext.$__getWidgetsContext = function (out) {
    var global = out.global;

    return out.data.widgets ||
        global.widgets ||
        (global.widgets = new WidgetsContext(out));
};

module.exports = WidgetsContext;
});
$_mod.def("/marko$4.0.0-rc.18/widgets/renderer", function(require, exports, module, __filename, __dirname) { var widgetsUtil = require('/marko$4.0.0-rc.18/widgets/util-browser'/*'./util'*/);
var widgetLookup = widgetsUtil.$__widgetLookup;
var emitLifecycleEvent = widgetsUtil.$__emitLifecycleEvent;
var nextRepeatedId = require('/marko$4.0.0-rc.18/widgets/nextRepeatedId'/*'./nextRepeatedId'*/);
var repeatedRegExp = /\[\]$/;
var WidgetsContext = require('/marko$4.0.0-rc.18/widgets/WidgetsContext'/*'./WidgetsContext'*/);
var registry = require('/marko$4.0.0-rc.18/widgets/registry-browser'/*'./registry'*/);

var WIDGETS_BEGIN_ASYNC_ADDED_KEY = '$wa';

function resolveWidgetRef(out, ref, scope) {
    if (ref.charAt(0) === '#') {
        return ref.substring(1);
    } else {
        var resolvedId;

        if (repeatedRegExp.test(ref)) {
            resolvedId = nextRepeatedId(out, scope, ref);
        } else {
            resolvedId = scope + '-' + ref;
        }

        return resolvedId;
    }
}

function preserveWidgetEls(existingWidget, out, widgetsContext) {
    var rootEls = existingWidget.$__getRootEls({});

    for (var elId in rootEls) {
        var el = rootEls[elId];

        // We put a placeholder element in the output stream to ensure that the existing
        // DOM node is matched up correctly when using morphdom.
        out.element(el.tagName, { id: elId });

        widgetsContext.$__preserveDOMNode(elId); // Mark the element as being preserved (for morphdom)
    }

    existingWidget.$__reset(); // The widget is no longer dirty so reset internal flags
    return true;
}

function handleBeginAsync(event) {
    var parentOut = event.parentOut;
    var asyncOut = event.out;
    var widgetsContext = asyncOut.global.widgets;
    var widgetStack;

    if (widgetsContext && (widgetStack = widgetsContext.$__widgetStack)) {
        // All of the widgets in this async block should be
        // initialized after the widgets in the parent. Therefore,
        // we will create a new WidgetsContext for the nested
        // async block and will create a new widget stack where the current
        // widget in the parent block is the only widget in the nested
        // stack (to begin with). This will result in top-level widgets
        // of the async block being added as children of the widget in the
        // parent block.
        var nestedWidgetsContext = new WidgetsContext(asyncOut, widgetStack[widgetStack.length-1]);
        asyncOut.data.widgets = nestedWidgetsContext;
    }
    asyncOut.data.$w = parentOut.data.$w;
}



function createRendererFunc(templateRenderFunc, widgetProps, renderingLogic) {
    if (typeof renderingLogic == 'function') {
        var ctor = renderingLogic;
        renderingLogic = renderingLogic.prototype;
        renderingLogic.onCreate = renderingLogic.onCreate || ctor;
    }

    renderingLogic = renderingLogic || {};
    var onInput = renderingLogic.onInput;
    var typeName = widgetProps.type;
    var roots = widgetProps.roots;
    var assignedId = widgetProps.id;

    return function renderer(input, out) {
        var outGlobal = out.global;

        if (!out.isSync()) {
            if (!outGlobal[WIDGETS_BEGIN_ASYNC_ADDED_KEY]) {
                outGlobal[WIDGETS_BEGIN_ASYNC_ADDED_KEY] = true;
                out.on('beginAsync', handleBeginAsync);
            }
        }

        var widget = outGlobal.$w;
        var isRerender = widget !== undefined;
        var id = assignedId;
        var isExisting;
        var customEvents;
        var scope;

        if (widget) {
            id = widget.id;
            isExisting = true;
            outGlobal.$w = null;
        } else {
            var widgetArgs = input && input.$w || out.data.$w;

            if (widgetArgs) {
                scope = widgetArgs[0];

                if (scope) {
                    scope = scope.id;
                }

                var ref = widgetArgs[1];
                if (ref != null) {
                    ref = ref.toString();
                }
                id = id || resolveWidgetRef(out, ref, scope);
                customEvents = widgetArgs[2];
                delete input.$w;
            }
        }

        var widgetsContext = WidgetsContext.$__getWidgetsContext(out);
        id = id || widgetsContext.$__nextWidgetId();

        if (registry.$__isServer) {
            widget = registry.$__createWidget(renderingLogic, id, input, out, typeName);
            input = widget.$__updatedInput;
            widget.$__updatedInput = undefined; // We don't want $__updatedInput to be serialized to the browser
        } else {
            if (!widget) {
                if (isRerender) {
                    // Look in in the DOM to see if a widget with the same ID and type already exists.
                    widget = widgetLookup[id];
                    if (widget && widget.$__type !== typeName) {
                        widget = undefined;
                    }
                }

                if (widget) {
                    isExisting = true;
                } else {
                    isExisting = false;
                    // We need to create a new instance of the widget
                    widget = registry.$__createWidget(typeName, id);
                }

                // Set this flag to prevent the widget from being queued for update
                // based on the new input. The widget is about to be rerendered
                // so we don't want to queue it up as a result of calling `setInput()`
                widget.$__updateQueued = true;

                if (!isExisting) {
                    emitLifecycleEvent(widget, 'create', input, out);
                }

                input = widget.$__setInput(input, onInput, out);

                if (isExisting) {
                    if (!widget.$__isDirty || !widget.shouldUpdate(input, widget.$__state)) {
                        preserveWidgetEls(widget, out, widgetsContext);
                        return;
                    }
                }
            }

            emitLifecycleEvent(widget, 'render', out);
        }

        var widgetDef = widgetsContext.$__beginWidget(widget);
        widgetDef.$__customEvents = customEvents;
        widgetDef.$__scope = scope;
        widgetDef.$__roots = roots;
        widgetDef.$__isExisting = isExisting;

        // Render the template associated with the component using the final template
        // data that we constructed
        templateRenderFunc(input, out, widgetDef, widget.$__rawState);

        widgetDef.$__end();
    };
}

module.exports = createRendererFunc;

// exports used by the legacy renderer
createRendererFunc.$__resolveWidgetRef = resolveWidgetRef;
createRendererFunc.$__preserveWidgetEls = preserveWidgetEls;
createRendererFunc.$__handleBeginAsync = handleBeginAsync;

});
$_mod.def("/marko$4.0.0-rc.18/widgets/index-browser", function(require, exports, module, __filename, __dirname) { var events = require('/marko$4.0.0-rc.18/runtime/events'/*'../runtime/events'*/);
var Widget = require('/marko$4.0.0-rc.18/widgets/Widget'/*'./Widget'*/);
var widgetsUtil = require('/marko$4.0.0-rc.18/widgets/util-browser'/*'./util'*/);

function onInitWidget(listener) {
    events.on('initWidget', listener);
}

exports.onInitWidget = onInitWidget;
exports.Widget = Widget;
exports.getWidgetForEl = widgetsUtil.$__getWidgetForEl;
exports.initWidgets = require('/marko$4.0.0-rc.18/widgets/init-widgets-browser'/*'./init-widgets'*/).$__initServerRendered;

exports.w = require('/marko$4.0.0-rc.18/widgets/defineWidget'/*'./defineWidget'*/); // Referenced by compiled templates
exports.r = require('/marko$4.0.0-rc.18/widgets/renderer'/*'./renderer'*/); // Referenced by compiled templates
exports.rw = require('/marko$4.0.0-rc.18/widgets/registry-browser'/*'./registry'*/).$__register;  // Referenced by compiled templates

window.$__MARKO_WIDGETS = exports; // Helpful when debugging... WARNING: DO NOT USE IN REAL CODE!
});
$_mod.installed("behealth$0.0.1", "marko", "4.0.0-rc.18");
$_mod.main("/marko$4.0.0-rc.18/runtime/vdom", "");
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/VComment", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.0.0-rc.18/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.1.0/inherit'/*'raptor-util/inherit'*/);

function VComment(value) {
    this.$__VNode(-1 /* no children */);
    this.nodeValue = value;
}

VComment.prototype = {
    nodeType: 8,

    actualize: function(doc) {
        return doc.createComment(this.nodeValue);
    },

    $__cloneNode: function() {
        return new VComment(this.nodeValue);
    }
};

inherit(VComment, VNode);

module.exports = VComment;

});
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/VDocumentFragment", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.0.0-rc.18/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.1.0/inherit'/*'raptor-util/inherit'*/);
var extend = require('/raptor-util$3.1.0/extend'/*'raptor-util/extend'*/);

function VDocumentFragmentClone(other) {
    extend(this, other);
    this.$__parentNode = undefined;
    this.$__nextSibling = undefined;
}

function VDocumentFragment(documentFragment) {
    this.$__VNode(null /* childCount */);
    this.namespaceURI = undefined;
}

VDocumentFragment.prototype = {
    nodeType: 11,

    $__DocumentFragment: true,

    $__nsAware: true,

    $__cloneNode: function() {
        return new VDocumentFragmentClone(this);
    },

    actualize: function(doc) {
        var docFragment = doc.createDocumentFragment();

        var curChild = this.firstChild;

        while(curChild) {
            docFragment.appendChild(curChild.actualize(doc));
            curChild = curChild.nextSibling;
        }

        return docFragment;
    }
};

inherit(VDocumentFragment, VNode);

VDocumentFragmentClone.prototype = VDocumentFragment.prototype;

module.exports = VDocumentFragment;

});
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/VText", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.0.0-rc.18/runtime/vdom/VNode'/*'./VNode'*/);
var inherit = require('/raptor-util$3.1.0/inherit'/*'raptor-util/inherit'*/);

function VText(value) {
    this.$__VNode(-1 /* no children */);
    this.nodeValue = value;
}

VText.prototype = {
    $__Text: true,

    nodeType: 3,

    actualize: function(doc) {
        return doc.createTextNode(this.nodeValue);
    },

    $__cloneNode: function() {
        return new VText(this.nodeValue);
    }
};

inherit(VText, VNode);

module.exports = VText;

});
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/vdom", function(require, exports, module, __filename, __dirname) { var VNode = require('/marko$4.0.0-rc.18/runtime/vdom/VNode'/*'./VNode'*/);
var VComment = require('/marko$4.0.0-rc.18/runtime/vdom/VComment'/*'./VComment'*/);
var VDocumentFragment = require('/marko$4.0.0-rc.18/runtime/vdom/VDocumentFragment'/*'./VDocumentFragment'*/);
var VElement = require('/marko$4.0.0-rc.18/runtime/vdom/VElement'/*'./VElement'*/);
var VText = require('/marko$4.0.0-rc.18/runtime/vdom/VText'/*'./VText'*/);
var defaultDocument = typeof document != 'undefined' && document;

var specialHtmlRegexp = /[&<]/;
var range;

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
                    var attrName;

                    if (attr.namespaceURI === 'http://www.w3.org/1999/xlink' && attr.localName === 'href') {
                        attrName = 'xlink:href';
                    } else {
                        attrName = attr.name;
                    }

                    attrs[attrName] = attr.value;
                }
            }

            var vdomEL = new VElement(node.nodeName, attrs);

            if (vdomEL.$__isTextArea) {
                vdomEL.$__value = node.value;
            } else {
                virtualizeChildNodes(node, vdomEL);
            }

            return vdomEL;
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

    if (!range && doc.createRange) {
        range = doc.createRange();
        range.selectNode(doc.body);
    }

    var vdomFragment;

    var fragment;
    if (range && range.createContextualFragment) {
        fragment = range.createContextualFragment(html);
        vdomFragment = virtualize(fragment);
    } else {
        var container = doc.createElement('body');
        container.innerHTML = html;
        vdomFragment = new VDocumentFragment();

        var curChild = container.firstChild;
        while(curChild) {
            vdomFragment.$__appendChild(virtualize(curChild));
            curChild = curChild.nextSibling;
        }
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
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/AsyncVDOMBuilder", function(require, exports, module, __filename, __dirname) { var EventEmitter = require('/events-light$1.0.5/src/index'/*'events-light'*/);
var vdom = require('/marko$4.0.0-rc.18/runtime/vdom/vdom'/*'./vdom'*/);
var VElement = vdom.$__VElement;
var VDocumentFragment = vdom.$__VDocumentFragment;
var VComment = vdom.$__VComment;
var VText = vdom.$__VText;
var virtualizeHTML = vdom.$__virtualizeHTML;
var RenderResult = require('/marko$4.0.0-rc.18/runtime/RenderResult'/*'../RenderResult'*/);
var defaultDocument = vdom.$__defaultDocument;

var FLAG_FINISHED = 1;
var FLAG_LAST_FIRED = 2;

var EVENT_UPDATE = 'update';
var EVENT_FINISH = 'finish';

function State(tree) {
    this.$__remaining = 1;
    this.$__events = new EventEmitter();
    this.$__tree = tree;
    this.$__last = undefined;
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
}

var proto = AsyncVDOMBuilder.prototype = {
    $__isOut: true,
    $__document: defaultDocument,

    element: function(name, attrs, childCount) {
        var element = new VElement(name, attrs, childCount);

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

        if (type !== 'string') {
            if (text == null) {
                return;
            } else if (type === 'object') {
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

    beginElement: function(name, attrs) {
        var element = new VElement(name, attrs);
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
            return this;
        }

        state.$__events.on(event, callback);
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
            var next = function next() {
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
$_mod.def("/marko$4.0.0-rc.18/runtime/renderable", function(require, exports, module, __filename, __dirname) { var defaultCreateOut = require('/marko$4.0.0-rc.18/runtime/createOut'/*'./createOut'*/);
var extend = require('/raptor-util$3.1.0/extend'/*'raptor-util/extend'*/);

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

                render(localData, out);
                return out.end();
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
            } else if (typeof out === 'function') {
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

            render(finalData, finalOut);

            return shouldEnd ? finalOut.end() : finalOut;
        }
    });
};
});
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/index", function(require, exports, module, __filename, __dirname) { 'use strict';
// helpers provide a core set of various utility methods
// that are available in every template
var AsyncVDOMBuilder = require('/marko$4.0.0-rc.18/runtime/vdom/AsyncVDOMBuilder'/*'./AsyncVDOMBuilder'*/);
var makeRenderable = require('/marko$4.0.0-rc.18/runtime/renderable'/*'../renderable'*/);

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

require('/marko$4.0.0-rc.18/runtime/createOut'/*'../createOut'*/).$__setCreateOut(createOut);

});
$_mod.def("/marko$4.0.0-rc.18/vdom", function(require, exports, module, __filename, __dirname) { module.exports = require('/marko$4.0.0-rc.18/runtime/vdom/index'/*'./runtime/vdom'*/);
});
$_mod.main("/marko$4.0.0-rc.18/widgets", "");
$_mod.def("/marko$4.0.0-rc.18/runtime/helpers", function(require, exports, module, __filename, __dirname) { 'use strict';
var isArray = Array.isArray;

function isFunction(arg) {
    return typeof arg === 'function';
}

function classListHelper(arg, classNames) {
    var len;

    if (arg) {
        if (typeof arg === 'string') {
            if (arg) {
                classNames.push(arg);
            }
        } else if (typeof (len = arg.length) === 'number') {
            for (var i=0; i<len; i++) {
                classListHelper(arg[i], classNames);
            }
        } else if (typeof arg === 'object') {
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

function classList(classList) {
    var classNames = [];
    classListHelper(classList, classNames);
    return classNames.join(' ');
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
    return classList(arguments);
};
});
$_mod.def("/marko$4.0.0-rc.18/runtime/vdom/helpers", function(require, exports, module, __filename, __dirname) { 'use strict';

var vdom = require('/marko$4.0.0-rc.18/runtime/vdom/vdom'/*'./vdom'*/);
var VElement = vdom.$__VElement;
var VText = vdom.$__VText;

var commonHelpers = require('/marko$4.0.0-rc.18/runtime/helpers'/*'../helpers'*/);
var extend = require('/raptor-util$3.1.0/extend'/*'raptor-util/extend'*/);

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
$_mod.def("/behealth$0.0.1/views/components/layout-inside-body-preloader/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require('/marko$4.0.0-rc.18/vdom'/*"marko/vdom"*/).t(),
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
    marko_widgets = require('/marko$4.0.0-rc.18/widgets/index-browser'/*"marko/widgets"*/),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/layout-inside-body-preloader/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require('/marko$4.0.0-rc.18/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("58e43d"),
    marko_node0 = marko_createElement("div", {
        "class": "sk-spinner sk-spinner-wave"
      }, 5, marko_const_nextId())
      .e("div", {
          "class": "sk-rect1"
        }, 0)
      .e("div", {
          "class": "sk-rect2"
        }, 0)
      .e("div", {
          "class": "sk-rect3"
        }, 0)
      .e("div", {
          "class": "sk-rect4"
        }, 0)
      .e("div", {
          "class": "sk-rect5"
        }, 0);

function render(input, out, widget, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.e("div", {
      id: widget.id
    }, 1)
    .n(marko_node0);
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType,
    id: "preloader"
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/layout-footer/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require('/marko$4.0.0-rc.18/vdom'/*"marko/vdom"*/).t(),
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
    marko_widgets = require('/marko$4.0.0-rc.18/widgets/index-browser'/*"marko/widgets"*/),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/layout-footer/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require('/marko$4.0.0-rc.18/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("c5d6f9"),
    marko_node0 = marko_createElement("div", {
        "class": "container"
      }, 2, marko_const_nextId())
      .e("div", {
          "class": "row"
        }, 3)
        .e("div", {
            "class": "col-md-5 col-sm-4"
          }, 5)
          .e("h3", null, 1)
            .t("Precisa de ajuda?")
          .e("a", {
              href: "tel://004542344599",
              id: "phone"
            }, 1)
            .t("+45 423 445 99")
          .e("a", {
              href: "mailto:ajuda@behealthbrasil.com.br",
              id: "email_footer"
            }, 1)
            .t("ajuda@behealthbrasil.com.br")
          .e("strong", null, 1)
            .t("Secure payments with")
          .e("p", null, 1)
            .e("img", {
                src: "img/payments.png",
                width: "231",
                height: "30",
                alt: "Image",
                "data-retina": "true",
                "class": "img-responsive"
              }, 0)
        .e("div", {
            "class": "col-md-3 col-sm-4"
          }, 2)
          .e("h3", null, 1)
            .t("Sobre")
          .e("ul", null, 6)
            .e("li", null, 1)
              .e("a", {
                  href: "/quemsomos"
                }, 1)
                .t("Quem somos")
            .e("li", null, 1)
              .e("a", {
                  href: "https://blog.behealthbrasil.com.br"
                }, 1)
                .t("BLOG")
            .e("li", null, 1)
              .e("a", {
                  href: "/faq"
                }, 1)
                .t("FAQ")
            .e("li", null, 1)
              .e("a", {
                  href: "/login"
                }, 1)
                .t("Login")
            .e("li", null, 1)
              .e("a", {
                  href: "/register"
                }, 1)
                .t("Cadastro")
            .e("li", null, 1)
              .e("a", {
                  href: "/termos"
                }, 1)
                .t("Termos e condições")
        .e("div", {
            "class": "col-md-3 col-sm-4",
            id: "newsletter"
          }, 4)
          .e("h3", null, 1)
            .t("Newsletter")
          .e("p", null, 1)
            .t("Fique por dentro das nossas novidades.")
          .e("div", {
              id: "message-newsletter_2"
            }, 0)
          .e("form", {
              method: "post",
              action: "assets/newsletter.php",
              name: "newsletter_2",
              id: "newsletter_2"
            }, 2)
            .e("div", {
                "class": "form-group"
              }, 1)
              .e("input", {
                  name: "email_newsletter_2",
                  id: "email_newsletter_2",
                  type: "email",
                  value: "",
                  placeholder: "Seu email",
                  "class": "form-control"
                }, 0)
            .e("input", {
                type: "submit",
                value: "Assinar",
                "class": "btn_1",
                id: "submit-newsletter_2"
              }, 0)
      .e("div", {
          "class": "row"
        }, 1)
        .e("div", {
            "class": "col-md-12"
          }, 1)
          .e("div", {
              id: "social_footer"
            }, 2)
            .e("ul", null, 2)
              .e("li", null, 1)
                .e("a", {
                    href: "https://www.facebook.com/behealthbrasil/",
                    target: "_blank"
                  }, 1)
                  .e("i", {
                      "class": "icon-facebook"
                    }, 0)
              .e("li", null, 1)
                .e("a", {
                    href: "https://www.instagram.com/behealthbr/",
                    target: "_blank"
                  }, 1)
                  .e("i", {
                      "class": "icon-instagram"
                    }, 0)
            .e("p", null, 1)
              .t("© Behealth 2017");

function render(input, out, widget, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.e("footer", {
      id: widget.id
    }, 1)
    .n(marko_node0);
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/group-box-icons/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require('/marko$4.0.0-rc.18/vdom'/*"marko/vdom"*/).t(),
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
    marko_widgets = require('/marko$4.0.0-rc.18/widgets/index-browser'/*"marko/widgets"*/),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/group-box-icons/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require('/marko$4.0.0-rc.18/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("82eb88"),
    marko_node0 = marko_createElement("div", {
        "class": "col-md-4 wow zoomIn",
        "data-wow-delay": "0.2s"
      }, 1, marko_const_nextId())
      .e("div", {
          "class": "feature_home"
        }, 7)
        .t(" ")
        .e("i", {
            "class": "icon-truck-1"
          }, 0)
        .e("h3", null, 2)
          .t("Frete ")
          .e("span", null, 1)
            .t("GRÁTIS")
        .e("p", null, 1)
          .t(" para pedidos feitos nos estabelecimentos da sua região ")
        .t(" ")
        .e("a", {
            href: "/faq?frete",
            "class": "btn_1 outline"
          }, 1)
          .t("Saiba mais")
        .t(" "),
    marko_node1 = marko_createElement("div", {
        "class": "col-md-4 wow zoomIn",
        "data-wow-delay": "0.4s"
      }, 1, marko_const_nextId())
      .e("div", {
          "class": "feature_home"
        }, 7)
        .t(" ")
        .e("i", {
            "class": " icon-money-2"
          }, 0)
        .e("h3", null, 2)
          .e("span", null, 1)
            .t("Compromisso")
          .t(" sempre")
        .e("p", null, 1)
          .t("O menor preço garantido. Aqui a gente cobre qualquer oferta. ")
        .t(" ")
        .e("a", {
            href: "/faq?preco",
            "class": "btn_1 outline"
          }, 1)
          .t("Saiba mais")
        .t(" "),
    marko_node2 = marko_createElement("div", {
        "class": "col-md-4 wow zoomIn",
        "data-wow-delay": "0.6s"
      }, 1, marko_const_nextId())
      .e("div", {
          "class": "feature_home"
        }, 7)
        .t(" ")
        .e("i", {
            "class": " icon-newspaper-1"
          }, 0)
        .e("h3", null, 3)
          .t("Venha ser ")
          .e("span", null, 1)
            .t("#BeHealth")
          .t(" ")
        .e("p", null, 1)
          .t("Acompanhe o blog da maior rede de saúde e bem estar ")
        .t(" ")
        .e("a", {
            href: "https://blog.behealthbrasil.com.br",
            target: "_blank",
            "class": "btn_1 outline"
          }, 1)
          .t("Saiba mais")
        .t(" ");

function render(input, out, widget, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.e("div", {
      "class": "row",
      id: widget.id
    }, 3)
    .n(marko_node0)
    .n(marko_node1)
    .n(marko_node2);
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

});
$_mod.def("/behealth$0.0.1/views/components/group-notebook-list/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require('/marko$4.0.0-rc.18/vdom'/*"marko/vdom"*/).t(),
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
    marko_widgets = require('/marko$4.0.0-rc.18/widgets/index-browser'/*"marko/widgets"*/),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/group-notebook-list/index.marko", function() {
      return module.exports;
    }),
    marko_helpers = require('/marko$4.0.0-rc.18/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
    marko_createElement = marko_helpers.e,
    marko_const = marko_helpers.const,
    marko_const_nextId = marko_const("043fc4"),
    marko_node0 = marko_createElement("div", {
        "class": "col-md-8 col-sm-6 hidden-xs"
      }, 3, marko_const_nextId())
      .t(" ")
      .e("img", {
          src: "img/laptop.png",
          alt: "Laptop",
          "class": "img-responsive laptop"
        }, 0)
      .t(" "),
    marko_node1 = marko_createElement("div", {
        "class": "col-md-4 col-sm-6"
      }, 6, marko_const_nextId())
      .e("h3", {
          style: "font-size:16px;"
        }, 2)
        .e("span", null, 1)
          .t("Experimente")
        .t(" comprar com a Behealth")
      .e("p", {
          tyle: "font-size:15px;"
        }, 1)
        .t(" Alguma instrução de uso")
      .e("ul", {
          "class": "list_order"
        }, 3)
        .e("li", null, 2)
          .e("span", null, 1)
            .t("1")
          .t("Passo 1")
        .e("li", null, 2)
          .e("span", null, 1)
            .t("2")
          .t("Passo 2")
        .e("li", null, 2)
          .e("span", null, 1)
            .t("3")
          .t("Passo 3")
      .t(" ")
      .e("a", {
          href: "all_tour_list.html",
          "class": "btn_1"
        }, 1)
        .t("Experimente já")
      .t(" ");

function render(input, out, widget, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.e("div", {
      "class": "row",
      id: widget.id
    }, 2)
    .n(marko_node0)
    .n(marko_node1);
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

});
$_mod.main("/behealth$0.0.1/views/components/group-box-icons", "index.marko");
$_mod.main("/behealth$0.0.1/views/components/group-notebook-list", "index.marko");
$_mod.def("/behealth$0.0.1/views/components/app-white-popular/index.marko", function(require, exports, module, __filename, __dirname) { // Compiled using marko@4.0.0-rc.18 - DO NOT EDIT
var marko_template = module.exports = require('/marko$4.0.0-rc.18/vdom'/*"marko/vdom"*/).t(),
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
    marko_widgets = require('/marko$4.0.0-rc.18/widgets/index-browser'/*"marko/widgets"*/),
    marko_registerWidget = marko_widgets.rw,
    marko_widgetType = marko_registerWidget("/behealth$0.0.1/views/components/app-white-popular/index.marko", function() {
      return module.exports;
    }),
    group_box_icons_template = require('/behealth$0.0.1/views/components/group-box-icons/index.marko'/*"../group-box-icons"*/),
    marko_helpers = require('/marko$4.0.0-rc.18/runtime/vdom/helpers'/*"marko/runtime/vdom/helpers"*/),
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
    marko_node0 = marko_createElement("hr", null, 0, marko_const_nextId());

function render(input, out, widget, state) {
  var data = input;

  var variantClassName = (input.variant !== 'primary' && 'app-button-' + input.variant);

  var sizeClassName = (input.size !== 'normal' && 'app-button-' + input.size);

  out.be("div", {
      "class": "",
      id: widget.id
    });

  out.be("div", marko_attrs0);

  group_box_icons_tag({}, out);

  out.n(marko_node0);

  group_notebook_list_tag({}, out);

  out.ee();

  out.ee();
}

marko_template._ = marko_widgets.r(render, {
    type: marko_widgetType
  }, marko_component);

marko_template.Widget = marko_widgets.w(marko_component, marko_template._);

});