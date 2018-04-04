'use strict';

var moment = require('moment');
var fs = require('fs');
var path = require('path');
var csv = require('csv');
var readline = require('readline');
var _ = require('lodash');
var By = require('selenium-webdriver').By;

var BrowserOps = require('./libs/BrowserOperations');
var verifyElement = BrowserOps.verifyElement;
var verifyElements = BrowserOps.verifyElements;
var click = BrowserOps.click;
var sendKeys = BrowserOps.sendKeys;
var executeScript = BrowserOps.executeScript;
var scrollBy = BrowserOps.scrollBy;
var loopInOrder = BrowserOps.loopInOrder;
var lookUntil = BrowserOps.lookUntil;
var pause = BrowserOps.pause;

var GoogleSheet = require('./libs/GoogleSheet');
var Utils = require('./libs/Utils');

var wordsFile = '' + fs.readFileSync('words.txt', 'utf-8');
var wordsArr = wordsFile.split('\n');
wordsArr = wordsArr.map(function(word){
	return word.split(' ')[0]
});

var namesFile = '' + fs.readFileSync('names.txt', 'utf-8');

var namesArr = namesFile.split('\r\n');
namesArr = namesArr.map(function(name){
	return name.split(' ')[0]
});
	
const DOWNLOAD_FOLDERS = [
    'C:\\\\Users\\Bryce\\Downloads',
    '/Users/andryu/Downloads'
];
/*
const SHEETS = {
    MASTER_SHEET_ID: '1N69T8xQ06AoLSXX2ijv8ClKegVv8r8bhb5kkDBntzlo',
    EXPIRED_LISTINGS_SHEET_ID: '1dZrIoCj_epf2ogtSktoCxR5YHeEUPTGU72eqRKqmKgo'
};
*/

//const SHEET_ID = '1N69T8xQ06AoLSXX2ijv8ClKegVv8r8bhb5kkDBntzlo';
const SHEET_ID = '1BEJ1a9ygp_eivM1q8Vr-9pTwgV-isNAB23Nj6Xs7njQ';
const TAB_NAMES = {MASTER: 'Master_List', EXPIRED_LISTINGS: 'Expired_Listings'};
var master_sheet = null;
var recentSheetArr = null;
var masterHouseArr = null;
var expiredListingsArr = null;
var removeFromMasterListArr = [];
var driver = BrowserOps.getChromeDriver();
var driver2 = BrowserOps.getChromeDriver();

downloadHouseCSV().then(function(){
	return extractHouseArrayFromCSV();
}).then(function(){
    master_sheet = new GoogleSheet(SHEET_ID, TAB_NAMES.MASTER);
	return getObjectValuesFromGoogleSheet(master_sheet);
}).then(function(){
	return processCSVFromToday();
}).then(function(){
	return processMasterList();
}).then(function(){
	masterHouseArr = masterHouseArr.filter(function(house){
		return !doFilterOrNot(house);
	});
}).then(function(){
	var googleReadyNewMasterList = convertObjectValuesToGoogleValues(masterHouseArr);
	return master_sheet.update_sheet(googleReadyNewMasterList);
}).then(function(){
	expiredListingsArr = masterHouseArr.filter(function(masterHouseEntry){
		return masterHouseEntry.STATUS === 'Not For Sale';
	});
	return loopInOrder(expiredListingsArr, function(exp_listing){
		return assignOwnerNameToHouseIfFound(exp_listing);
	});
}).then(function(){
	var googleReadyExpiredListingsList = convertObjectValuesToGoogleValues(expiredListingsArr);
	if(googleReadyExpiredListingsList.length === 1) return Promise.resolve();
	var expired_listings_sheet = new GoogleSheet(SHEET_ID, TAB_NAMES.EXPIRED_LISTINGS);
	return expired_listings_sheet.update_sheet(googleReadyExpiredListingsList);
});
  
function downloadHouseCSV(){
	return driver.get('https://www.redfin.com/stingray/api/gis-csv?al=1&market=littlerock&num_homes=22000&ord=price-asc&page_number=1&poly=-93.10751575078125%2034.23010298691406%2C-91.31018664921875%2034.23010298691406%2C-91.31018664921875%2035.13309981308594%2C-93.10751575078125%2035.13309981308594%2C-93.10751575078125%2034.23010298691406&sf=1,7&sp=true&status=7&uipt=1,2,3,4,5,6&v=8').then(function(){
	  return pause(20000);
	});
}

function extractHouseArrayFromCSV(){
	const download_folder = _.filter(DOWNLOAD_FOLDERS, function(folder) {
		return fs.existsSync(folder);
    })[0];
    var files = fs.readdirSync(download_folder).filter(function(file) {
        return file.includes('redfin_' + moment().format('YYYY-MM-DD'));
    });
    if (files.length === 0) throw new Error('There were no files found from redfin.');
    const file_content = fs.readFileSync(path.join(download_folder, files[0]), 'utf-8');
    recentSheetArr = Utils.parseCSV(file_content);
}

function getObjectValuesFromGoogleSheet(google_sheet){
	return google_sheet.get_sheet().then(function(google_values){
		if(google_values.values) masterHouseArr = convertGoogleValuesToObjectValues(google_values.values);
		else masterHouseArr = [];
	});
}

function processCSVFromToday(){
	//go through each house from csv downloaded today, if it's in the master list
	//then update the status of the house in the master list. if it's not in the
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
}

function assignOwnerNameToHouseIfFound(elem){
	//go to arcountydata.com to find the first and last name of house owners if not already done
		  if(elem['FIRST NAME'] && elem['LAST NAME']){
			  return Promise.resolve();
		  }
		  var address = elem['ADDRESS'];
		  console.log('Finding first and last name of address: ' + address);
		  var address_parts = address.split(' ');
		  var street_num = parseInt(address_parts[0]);
		  if(isNaN(street_num)){
			  console.log('Not a valid address.');
			  return Promise.resolve();
		  }
		  var street_direction = null;
		  var possible_street_directions = ['N', 'E', 'S', 'W', 'NE', 'NW', 'SE', 'SW'];
		  if(possible_street_directions.some(function(pos_str_dir){
			  return pos_str_dir.toLowerCase() === address_parts[1].toLowerCase();
		  })){
			  street_direction = address_parts[1].toUpperCase();
		  }
		  var address_street_name_start_index = 1;
		  var address_street_name = "";
		  if(street_direction){
			  address_street_name_start_index = 2;
		  }
		  var possible_street_types = ['Rd', 'Ct', 'Loop', 'Lp', 'St', 'Cv', 'Dr', 'Ln', 'Ave', 'Av', 'Cir', 'Cr'];
		  for(var index = address_street_name_start_index; index < address_parts.length; index++){
			  var address_part = address_parts[index];
			  if(possible_street_types.some(function(pos_str_type){
				  if(pos_str_type.toUpperCase() === address_part.toUpperCase()) return true;
				  if(pos_str_type.toUpperCase() + '.' === address_part.toUpperCase()) return true;
			  })) continue;
			  var address_part_as_int = parseInt(address_part);
			  if(!isNaN(address_part_as_int)){
				  var ord_num = getOrdinalFor(address_part_as_int, true);
				  address_parts[index] = ord_num;
				  address_part = ord_num;
			  }
			  address_street_name += address_part;
			  if(index !== address_parts.length - 1){
				  address_street_name += ' ';
			  }
		  }
		  var city = elem['CITY'];
		  return searchForHouseOwnerOnARCountyData(driver2, city, address_street_name, street_num, street_direction).then(function(text){
			  if(!text) throw new Error();
			  return parseOwnerAsNameAndAssignToHouse(text, elem);
		  }).catch(function(e){
			  console.log('Name not found initially.');
			  var promise = Promise.resolve();
			  if(city.toUpperCase() === 'NORTH LITTLE ROCK'){
				  promise = searchForHouseOwnerOnARCountyData(driver2, 'LITTLE ROCK', address_street_name, street_num, street_direction);
			  }
			  else if(city.toUpperCase() === 'LITTLE ROCK'){
				  promise = searchForHouseOwnerOnARCountyData(driver2, 'NORTH LITTLE ROCK', address_street_name, street_num, street_direction);
			  }
			  else return Promise.resolve();
			  return promise.then(function(text){
				if(!text) throw new Error();
				return parseOwnerAsNameAndAssignToHouse(text, elem);
			  });
		  }).catch(function(e){
			  console.log('Could not find name.');
		  });
}

function parseOwnerAsNameAndAssignToHouse(text, elem){
	//console.log('owner name: ' + text);
	var split_name = text.split('/');
	if(!isName(text)){
	  //console.log('The owner does not seem to be an individual: ' + text);
	  elem['CORPORATION NAME'] = text;
	  return;
   }
   //discard everything after (and including) / or possibly \ because that usually means it's more than one name.
	var maxIndex = Math.max(text.indexOf('\\'), text.indexOf('/'));
	if(maxIndex !== -1){
		text = text.substring(0, maxIndex);
	}
   var split = text.split(" ");
   var lastName = split[0];
   var firstName = split.slice(1).join(' ');
   console.log('Found name! First: ' + firstName + ", Last: " + lastName);
   elem['FIRST NAME'] = firstName;
   elem['LAST NAME'] = lastName;
}
				  

function processMasterList(){
	//go through each house in master list, if it's not on the csv downloaded today,
	//search it in redfin to see what its status is
	console.log('looping through houses in master house list, checking if its current status is known based on the latest csv download');
	return loopInOrder(masterHouseArr, function(elem){
		delete elem['SOLD DATE'];
		delete elem['NEXT OPEN HOUSE START TIME'];
		delete elem['NEXT OPEN HOUSE END TIME'];
		delete elem['FAVORITE'];
		delete elem['INTERESTED'];
		
		if(!elem['LAST SOLD DATE']) elem['LAST SOLD DATE'] = "";
		if(!elem['FIRST NAME']) elem['FIRST NAME'] = "";
		if(!elem['LAST NAME']) elem['LAST NAME'] = "";
		if(!elem['CORPORATION NAME']) elem['CORPORATION NAME'] = "";

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
				 if(!elem['LAST SOLD DATE']){
					 elem['LAST SOLD DATE'] = "" + new Date();
				 }
			} 
		  } 	 
	  }).catch(function(err){
		  elem.STATUS = 'Not Found';
		  console.log(err.stack + '\n');
		  console.log('Could not get status of address: ' + elem.ADDRESS + '\n\n\n');
	  });
  });
}

function houseOnPageIsSold(pageSrc){
	return pageSrc.includes('sold for');
}

function houseOnPageIsPending(pageSrc){
	return pageSrc.includes('PENDING');
}

function houseOnPageIsAcceptBackups(pageSrc){
	return pageSrc.includes('"sash-text">ACCEPTING BACKUP OFFERS');
}

function houseOnPageIsNotForSale(pageSrc){
	return pageSrc.includes("NOT FOR SALE");
}

function searchForStatusOnHousePage(driver){
	return driver.getPageSource().then(function(source){
		/*console.log('pending: ' + houseOnPageIsPending(source));
		console.log('accept backups: ' + houseOnPageIsAcceptBackups(source));
		console.log('not for sale: ' + houseOnPageIsNotForSale(source));
		console.log('sold: ' + houseOnPageIsSold(source));*/
		
		if(houseOnPageIsPending(source)) return 'Pending';
		if(houseOnPageIsAcceptBackups(source)) return 'Accept Backups';
		if(houseOnPageIsNotForSale(source)) return 'Not For Sale';
		if(houseOnPageIsSold(source)) return 'Sold';
		return 'Active';
	});
}

function searchForStatusOfHouseInRedfin(driver, elem){
	return searchForHouseInRedfin(driver, elem).then(function(){
		return searchForStatusOnHousePage(driver);
	});
}

function searchForHouseOwnerOnARCountyData(driver, city, address_street_name, street_num, street_direction){
	return driver.get('https://www.arcountydata.com/').then(function(){
			  return click(By.xpath('//area[@title="Pulaski"]'));
		  }).then(function(){
			  return sendKeys(By.id("StreetNumber"), street_num);
		  }).then(function(){
			  if(street_direction){
				  return click(By.id("siteDirection")).then(function(){
					  return click(By.xpath('//option[@value="' + street_direction + '"]'));
				  });
			  }else{
				  return Promise.resolve();
			  }
		  }).then(function(){
			  return sendKeys(By.id("StreetName"), address_street_name);
		  }).then(function(){
			  return sendKeys(By.id("City"), city);
		  }).then(function(){
			  return click(By.id("Search1"));
		  }).then(function(){
			  return driver2.getPageSource().then(function(source){
				  if(source.includes('Nothing Matching')) throw new Error(); //skip selenium page search if nothing found
			  });
		  }).then(function(){
			  return BrowserOps.verifyElements(By.xpath('//a[text()="Parcel #"]/../../../../../../../../tbody[1]/tr'));
		  }).then(function(elements){
			  console.log(elements.length);
			  if(elements.length === 0) throw new Error('Did not find the table.');
			  if(elements.length === 1) throw new Error('Unexpected condition.');
			  if(elements.length === 2) return elements[1].findElement(By.xpath('td[2]')).then(function(element){
				  return element.getText().then(function(text){
					  console.log(text);
					  return text;
				  });
			  });
			  
			  elements = elements.slice(1);
			  var promises = [];
			  for(var i = 0; i < elements.length; i++){
				  promises.push(elements[i].findElement(By.xpath('//td[4]')).then(function(element){
					  return element.getText();
				  }));
			  }
			  return Promise.all(promises).then(function(results){
				  console.log('multiple results: ');
				  results.forEach(function(result){
					  console.log(results.split('\n'));

				  });
				  throw new Error('Too many results.');
			  });
		  });
}

function doFilterOrNot(house){
	if(house.PRICE > 250000) return true;
	var propertyType = house['PROPERTY TYPE'];
	if(!(propertyType === 'Single Family Residential' || propertyType.includes('Multi-Family') 
		|| propertyType === 'Townhouse')) return true;
	if(!house.BEDS || house.BEDS < 2) return true;
	if(house['SALE TYPE'] !== 'MLS Listing') return true;
	if(house['LAST SOLD DATE']){
		var lastSoldDate = new Date(house['LAST_SOLD_DATE']);
		if(lastSoldDate.getTime() / 1000 / 60 / 60 / 24 >= 7) return true;
	}

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


function isName(str){
	var name = str;
	//discard everything after (and including) / or possibly \ because that usually means it's more than one name.
	var maxIndex = Math.max(name.indexOf('\\'), name.indexOf('/'));
	if(maxIndex !== -1){
		name = name.substring(0, maxIndex);
	}
	var name_split = name.split(' ');
	
	//sum over each word (part of a name), adding points for each word.
	//if it's as name-like as possible, it's +1, if it's as word-like 
	//as possible (indicating it's like a corporation name), it's -1
	//and 0 if it's undecisive. If the word definitely points toward
	//it being a corporation name (e.g., LLC, INC), it's -999 points.
	var points = 0;
	for(var i = 0; i < name_split.length; i++){
		var name_part = name_split[i];
		if(i === 0){
			//this may be the last name... points for being a name,
			//and also for being not a word
			if(isAName(name_part)){
				points += .5;
			}
			
			if(!isAWord(name_part)){
				points += .5;
			}
		} else{
			//This is first or middle name maybe, or part of the corporation name.
			if(isAName(name_part)){
				points += .5;
			} else if (name_part.length === 1){
				points += 1;
			} else {
				points -= .5;
			}
			
			if(isAWord(name_part)){
				points -= .5;
			} else {
				points += .5;
			}
		}
		if(isDefinitelyCorporationWord(name_part)){
			return false;
		}
		if(isANumber(name_part)){
			points -= 1;
		}
		if(isNameTitle(name_part)){
			points += 1;
		}
	}
	
	return points > 0;
}

function isAWord(string){
	return wordsArr.some(function(word){
		return (word.toLowerCase() === string.toLowerCase());
	});
}

function isAName(string){
	return namesArr.some(function(name){
		return (name.toLowerCase() === string.toLowerCase());
	});
}

function isANumber(string){
	return !isNaN(Number(string));
}

function isNameTitle(string){
	var name_titles = [
		'sr',
		'jr',
		'iii'
	];
	return name_titles.some(function(word){
		return word.toLowerCase() === string.toLowerCase();
	});
}

function isDefinitelyCorporationWord(string){
	var corp_words = [
		'LLC',
		'INC',
		'of',
		'revocable',
		'trust',
		'holding',
		'holdings',
		'incorporated',
		'limited',
		'ltd',
		'corporation'
	];
	return corp_words.some(function(word){
		return word.toLowerCase() === string.toLowerCase();
	});
}

function getOrdinalFor(intNum, includeNumber){
	var o = [,"st","nd","rd"];
	return (includeNumber ? intNum : "")
      + (o[((intNum = Math.abs(intNum % 100)) - 20) % 10] || o[intNum] || "th");
}

  
