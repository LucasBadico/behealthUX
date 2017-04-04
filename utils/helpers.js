var Helper = function (){
	
};


Helper.trim = function(str) {
    //console.log('str: ', str);
    if (str === undefined){
        return false;
    }else{
        var noDuplicado = str.replace(/\s{1,}/g, '');
        var leftRight = noDuplicado.replace(/^\s+|\s+$/g,"");
        return leftRight;
    }    

}

Helper.trim_ = function(str) {

	var noDuplicado = str.replace(/\s{1,}/g, ' ');
	var leftRight = noDuplicado.replace(/^\s+|\s+$/g,"");
	return leftRight;

}
module.exports = Helper;