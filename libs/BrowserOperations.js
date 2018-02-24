'use strict';

require('chromedriver');
var webdriver = require('selenium-webdriver');
var until = webdriver.until;
var chrome = require('selenium-webdriver/chrome');

var driver = null;

module.exports.getChromeDriver = function() {
    driver = new webdriver.Builder().forBrowser('chrome').build();
    return driver;
};

var verifyElement = module.exports.verifyElement = function(locator) {
    return driver.wait(until.elementLocated(locator), 10000).then(function(){
        return driver.findElement(locator);
    });
};

module.exports.verifyElements = function (locator) {
    return driver.wait(until.elementLocated(locator), 10000).then(function(){
        return driver.findElements(locator);
    });
};

module.exports.click = function (locator) {
    return verifyElement(locator).then(function(element){
        return element.click();
    });
};

module.exports.sendKeys = function(locator, keys) {
    var elem = null;
    return verifyElement(locator).then(function(element){
        elem = element;
        return elem.clear();
    }).then(function(){
        return elem.sendKeys(keys);
    });
};

module.exports.executeScript = function (script, locator) {
    if(locator){
        return driver.executeScript();
    }
    else{
        return driver.executeScript();
    }
};

module.exports.scrollBy = function (x, y) {
    return executeScript('window.scrollBy(' + x + ',' + y + ')');
};

function loopInOrderFn(arr, fn, index) {
    if(!index) index = 0;
    if(arr.length === 0) return Promise.resolve();
    return fn(arr[index], index).then(function(){
        if(index + 1 < arr.length) return loopInOrderFn(arr, fn, index + 1);
        else return Promise.resolve();
    });
};

function lookUntilFn(fn) {
    return fn().then(function(result){
        if(result) return lookUntilFn(fn);
        else return Promise.resolve();
    });
};

module.exports.loopInOrder = loopInOrderFn;

module.exports.lookUntil = lookUntilFn;

module.exports.pause = function(millis) {
    return new Promise(function(fulfill){
        setTimeout(function(){
            fulfill();
        }, millis);
    });
};