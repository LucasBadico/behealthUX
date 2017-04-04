$_mod.def("/raptor-util$2.0.0/attr", function(require, exports, module, __filename, __dirname) { var escapeXmlAttr = require('/raptor-util$2.0.0/escapeXml'/*'./escapeXml'*/).attr;

module.exports = function(name, value, escapeXml) {
    if (value === true) {
        value = '';
    } else if (value == null || value === false) {
        return '';
    } else {
        value = '="' + (escapeXml === false ? value : escapeXmlAttr(value)) + '"';
    }
    return ' ' + name + value;
};

});