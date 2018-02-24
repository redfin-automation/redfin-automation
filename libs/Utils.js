'use strict';

module.exports.pause = function(millis) {
    return new Promise(function(fulfill){
        setTimeout(function(){
            fulfill();
        }, millis);
    });
};

module.exports.loopInOrder = function(arr, fn, index) {
    if(!index) index = 0;
    if(arr.length === 0) return Promise.resolve();
    return fn(arr[index], index).then(function(){
        if(index + 1 < arr.length) return loopInOrderFn(arr, fn, index + 1);
        else return Promise.resolve();
    });
};

module.exports.parseCSV = function(fileContent) {
    var finalArr = [];
    var lines = fileContent.split('\n');
    var firstLine = lines[0];
    var columnNames = readCSVLine(firstLine);
    console.log('columns: ' + JSON.stringify(columnNames));
    lines = lines.slice(1);
    lines.forEach(function(line){
		if(line && !line.includes('Over 500 results.')){
            var values = readCSVLine(line);
            if(values.length !== columnNames.length) throw new Error('For some reason, this line has more or less values than there are columns.');
            var obj = {};
            values.forEach(function(value, index){
                obj[columnNames[index]] = value;
            });
            finalArr.push(obj);
        }
    });
    return finalArr;
};

var readCSVLine = function(line) {
    var numChars = line.length;
    var values = [];
    var currentValue = '';
    var startNewValue = true;
    var quoteMode = false;
    for(var i = 0; i < numChars; i++){
        var character = line.charAt(i);
        if((!quoteMode && character === ',') || i === numChars - 1){
            values.push(currentValue);
            currentValue = '';
            startNewValue = true;
            quoteMode = false;
        }
        else if(character === '"'){
            if(startNewValue){
                quoteMode = true;
                startNewValue = false;
            }
            else{
                var nextChar = line.charAt(i + 1);
                if(nextChar === '"'){
                    i++;
                    currentValue += nextChar;
                }
                else if(!nextChar || nextChar === ',')
                {
                    values.push(currentValue);
                    i++;
                    currentValue = '';
                    startNewValue = true;
                    quoteMode = false;
                }
                else throw new Error('Unexpected next character after ": ' + nextChar);
            }
        }
        else{
            currentValue += character;
            startNewValue = false;
        }
    }
    return values;
};