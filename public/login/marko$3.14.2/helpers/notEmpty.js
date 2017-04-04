$_mod.def("/marko$3.14.2/helpers/notEmpty", function(require, exports, module, __filename, __dirname) { module.exports = function notEmpty(o) {
    if (o == null) {
        return false;
    } else if (Array.isArray(o)) {
        return !!o.length;
    } else if (o === '') {
        return false;
    }

    return true;
};
});