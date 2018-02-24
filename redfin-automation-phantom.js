'use strict';

var moment = require('moment');
var fs = require('fs');
var path = require('path');
var csv = require('csv');
var readline = require('readline');
var _ = require('lodash');
var By = require('selenium-webdriver').By;

var GoogleSheet = require('./libs/GoogleSheet');
var Utils = require('./libs/Utils');

var loopInOrder = Utils.loopInOrder;
var pause = Utils.pause;

const SHEET_ID = '1-Go0Hf_PUo9cRJQEqNsr3mzcLP_4bvxD9bCB6JlSyrE';
const TAB_NAMES = {MASTER: 'Master_List', EXPIRED_LISTINGS: 'Expired_Listings'};
var master_sheet = null;
var recentSheetArr = null;
var masterHouseArr = null;
var removeFromMasterListArr = [];

var phantom = require("phantom");
var _ph, _page, _outObj, out;

phantom.create().then(function(ph){
    _ph = ph;
    return _ph.createPage();
}).then(function(page){
    _page = page;
    return _page.open('https://www.redfin.com/AR/Little-Rock/11-Templin-Trl-72205/home/95342032');
}).then(function(status){
    console.log(status);
	/*
    return _page.includeJs("http://ajax.googleapis.com/ajax/libs/jquery/1.6.1/jquery.min.js");
}).then(function(){
    return _page.evaluate(function() {
		var out;
			$.ajax({
				'async' : false,
				'url' : 'stingray/api/gis-csv?al=1&market=littlerock&num_homes=22000&ord=price-asc&page_number=1&poly=-93.10751575078125%2034.23010298691406%2C-91.31018664921875%2034.23010298691406%2C-91.31018664921875%2035.13309981308594%2C-93.10751575078125%2035.13309981308594%2C-93.10751575078125%2034.23010298691406&sf=1,2,3,5,6,7&sp=true&status=7&uipt=1,2,3,4,5,6&v=8',
				'success' : function(data, status, xhr) {
					//out = data;
					out = "xhr: " + JSON.stringify(xhr);
				},
				'error' : function(xhr, status, error){
					out = "error!\n" + "xhr: " + JSON.stringify(xhr) + "\nstatus: " + status + "\nerror: " + error;
				}
			});
			return out;
		});
}).then(function(file_content){
	console.log('result: ' + file_content);
	master_sheet = new GoogleSheet(SHEET_ID, TAB_NAMES.MASTER);
	return master_sheet.get_sheet();
	recentSheetArr = Utils.parseCSV(file_content);
	*/
	return _page.evaluate(function(){
		return document.body.outerHTML;
	});
}).then(function(elements){
	console.log(JSON.stringify(elements));
}).then(function(objValues){
	process.exit(0);
	if(objValues.values) masterHouseArr = convertGoogleValuesToObjectValues(objValues.values);
	else masterHouseArr = [];

	//go through each house from csv downloaded today, if it's in the master list
	//then update the status of the house in the master list. if it's not in the]
	//master list then add it to the master list
	console.log('looping through houses on csv downloaded today, updating master house list...');
	recentSheetArr.forEach(function(recentHouse){
		var skip = doFilterOrNot(recentHouse);
		if(skip) {
			console.log('filtering ' + JSON.stringify(recentHouse));
			return;
		}
		var recentHouseKey = recentHouse.ADDRESS + recentHouse.CITY + recentHouse.STATE + recentHouse.ZIP;
		var found = false;
		masterHouseArr.forEach(function(knownHouse){
			if(found) return;
			var knownHouseKey = knownHouse.ADDRESS + knownHouse.CITY + knownHouse.STATE + knownHouse.ZIP;
			if(recentHouseKey === knownHouseKey){
				found = true;
				knownHouse.STATUS = recentHouse.STATUS;
			}
		});
		if(!found){
			masterHouseArr.push(recentHouse);
		}
	});
	//go through each house in master list, if it's not on the csv downloaded today,
	//search it in redfin to see what its status is
	console.log('looping through houses in master house list, checking if its current status is known based on the latest csv download');
	return loopInOrder(masterHouseArr, function(elem){
		delete elem['SOLD DATE'];
		delete elem['NEXT OPEN HOUSE END TIME'];
		if(!elem['CONSECUTIVE SOLD DAYS']) elem['CONSECUTIVE SOLD DAYS'] = 0;
		var knownHouseKey = elem.ADDRESS + elem.CITY + elem.STATE + elem.ZIP;
		console.log(knownHouseKey);
		var found = false;
	  recentSheetArr.forEach(function(recentHouse){
		if(found) {
			return;
		}
		var recentHouseKey = recentHouse.ADDRESS + recentHouse.CITY + recentHouse.STATE + recentHouse.ZIP;
		if(knownHouseKey === recentHouseKey) {
			console.log('this one was found on the list.');
			found = true;
		}
	  });
	  var promise = null;
	  if(found){
		if(elem.STATUS === 'Contingent'){
			promise = driver.get(elem['URL (SEE http://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)']).then(function(){
				return searchForStatusOnHousePage(driver);
			});
		}
		else promise = Promise.resolve();
	  }
	  else promise = driver.get(elem['URL (SEE http://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)']).then(function(){
		return searchForStatusOnHousePage(driver);
	  });
	  return promise.then(function(status){
		  if(status){
			 elem.STATUS = status;	
			 if(status.toLowerCase() === 'sold'){
			  elem['CONSECUTIVE SOLD DAYS'] = parseInt(elem['CONSECUTIVE SOLD DAYS']) + 1;
			} 
		  } 	 
	  }).catch(function(err){
		  elem.STATUS = 'Not Found';
		  console.log(err.stack + '\n');
		  console.log('Could not get status of address: ' + elem.ADDRESS + '\n\n\n');
	  });
  });
}).then(function(value){
    _page.close();
    _ph.exit();
}).catch(function(e){
   console.log(e); 
});


function doFilterOrNot(house){
	if(house.PRICE > 250000) return true;
	var propertyType = house['PROPERTY TYPE'];
	if(!(propertyType === 'Single Family Residential' || propertyType.includes('Multi-Family') 
		|| propertyType === 'Townhouse')) return true;
	if(!house.BEDS || house.BEDS < 2) return true;
	if(house['SALE TYPE'] !== 'MLS Listing') return true;
	if(house['CONSECUTIVE SOLD DAYS'] &&  house['CONSECUTIVE SOLD DAYS'] >= 7) return true;

	//think about using zip code instead if this doesn't work well
	var pk_towns = ['cammack village', 'jacksonville', 'little rock', 'maumelle',
		'north little rock', 'sherwood', 'wrightsville', 'alexander', 'college station',
		'gibson', 'hensley', 'landmark', 'mcalmont', 'crystal hill', 'gravel ridge', 
		'ironton', 'mabelvale' ,'marche', 'woodyardville'];
	return !pk_towns.some(function(town){
		return town === house.CITY.toLowerCase();
	});
}
  
function convertGoogleValuesToObjectValues(googleValues){
	var headerArr = googleValues[0];
	var valuesArrs = googleValues.slice(1);
	var resultArr = [];
	valuesArrs.forEach(function(values){
		var obj = {};
		values.forEach(function(value, index){
			obj[headerArr[index]] = value;
		});
		resultArr.push(obj);
	});
	return resultArr;
}

function convertObjectValuesToGoogleValues(objectValues){
	var googleHeader = [];
	var finalGoogleValues = [];
	finalGoogleValues.push(googleHeader);
	objectValues.forEach(function(obj){
		var row = [];
		var keys = Object.getOwnPropertyNames(obj);
		keys.forEach(function(key){
			if(googleHeader.indexOf(key) === -1) googleHeader.push(key);
			row[googleHeader.indexOf(key)] = obj[key];
		});
		finalGoogleValues.push(row);
	});
	return finalGoogleValues;
}
  
