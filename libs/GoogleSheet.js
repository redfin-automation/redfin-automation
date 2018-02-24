'use strict';

let Promise = require('bluebird');
let fs = Promise.promisifyAll(require('fs'));
let readline = require('readline');
let googleAuth = require('google-auth-library');
let google = require('googleapis');


// change to the appropriate path
const CLIENT_SECRET_FILEPATH = 'client_secret.json';
// If modifying these scopes, delete your previously saved _credentials
// at ~/._credentials/sheets.googleapis.com-nodejs-quickstart.json
const SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets'
    //'https://www.googleapis.com/auth/spreadsheets.readonly'
];
const TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/._credentials/';
const TOKEN_PATH = TOKEN_DIR + 'sheets.googleapis.com-nodejs-quickstart.json';


module.exports = class GoogleSheet {

    constructor(sheet_id, tab_name) {
        this.sheet_id = sheet_id;
		this.tab_name = tab_name;
        this.initialized = false;
        this.sheets_api = google.sheets('v4');
        this._credentials = null;
        this.oauth2_client = null;
    }

    load_client_secret() {
        let that = this;
        if (that._credentials) {
            return Promise.resolve(that._credentials);
        }
        return fs.readFileAsync(CLIENT_SECRET_FILEPATH).catch(function(e) {
            throw new Error('Error loading client secret file: ' + e.message);
        }).then(function(content) {
            that._credentials = JSON.parse(content);
            return Promise.resolve();
        });
    }

    // need to load client secret first
    authorize() {
        let that = this;
        return Promise.resolve().then(function() {
            if (!that._credentials) {
                return that.load_client_secret();
            }
        }).then(function() {
            let auth = new googleAuth();
            that.oauth2_client = new auth.OAuth2(
                that._credentials.installed.client_id,
                that._credentials.installed.client_secret,
                that._credentials.installed.redirect_uris[0]
            );
            return fs.readFileAsync(TOKEN_PATH);    // Check previously stored token.
        }).then(function(token) {
            that.oauth2_client.credentials = JSON.parse(token);
            return Promise.resolve();
        }).catch(function(e) {
            return that._get_new_token()
        });
    }

    _get_new_token() {
        let that = this;
        let rl = null;

        return Promise.resolve().then(function() {
            rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            const authUrl = that.oauth2_client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES
            });
            console.log('Authorize this app by visiting this url: ', authUrl);
            let question = Promise.promisify(function(question, callback) {
                rl.question(question, callback.bind(null, null));
            });
            return question('Enter the code from that page here: ');
        }).then(function(code) {
            rl.close();
            Promise.promisifyAll(require('google-auth-library/lib/auth/oauth2client').prototype);
            return that.oauth2_client.getTokenAsync(code);
        }).catch(function (e) {
            throw e;
            //throw new Error('Error while trying to retrieve access token: ', e.message);
        }).then(function(token) {
            that.oauth2_client.credentials = token;
            return that._store_token(token);
        });
    }

    _store_token(token) {
        return fs.mkdirAsync(TOKEN_DIR).catch(function(e) {
            if (e.name.index('EEXIST') > -1) {
                throw e;
            }
        }).then(function() {
            return fs.writeFileAsync(TOKEN_PATH, JSON.stringify(token));
        }).then(function() {
            console.log('Token stored to ' + TOKEN_PATH);
            return Promise.resolve();
        });
    }

    get_sheet() {
        let that = this;
        return that.authorize().then(function() {
            let get = Promise.promisify(that.sheets_api.spreadsheets.values.get);
            return get({
                auth: that.oauth2_client,
                spreadsheetId: that.sheet_id,
                range: (that.tab_name ? that.tab_name + '!' : '') + 'A1:ZZ999999',
            });
        });
    }

    clear_sheet() {
        let that = this;
        return that.authorize().then(function() {
            let clear = Promise.promisify(that.sheets_api.spreadsheets.values.clear);
            return clear({
                auth: that.oauth2_client,
                spreadsheetId: that.sheet_id,
                range: (that.tab_name ? that.tab_name + '!' : '') + 'A1:ZZ999999'
            });
        });
    }

    update_sheet(values) {
        let that = this;
        return that.clear_sheet().then(function () {
            return that.authorize();
        }).then(function () {
            let update = Promise.promisify(that.sheets_api.spreadsheets.values.update);
			var requestObj = {
                auth: that.oauth2_client,
                spreadsheetId: that.sheet_id,
                valueInputOption: 'RAW',
                range: (that.tab_name ? that.tab_name + '!' : '') + that._get_range_for_dimensions(values[0].length, values.length),
                resource: {
                    values: values
                }
            };
			try{
				console.log(JSON.stringify(requestObj));
			}
			catch(err){
				var util = require('util');
				console.log(util.inspect(requestObj));
			}
            return update(requestObj);
        });
    }

    _get_range_for_dimensions(x, y, xoffset, yoffset) {
        if(!xoffset) xoffset = 0;
        if(!yoffset) yoffset = 0;
        x--;
        y--;
        let initialCell = String.fromCharCode(xoffset + 65) + (yoffset + 1);
        let finalCell = String.fromCharCode(xoffset + x + 65) + (yoffset + y + 1);
        return initialCell + ':' + finalCell;
    }

    get_range_of_cells(x, y, xoffset, yoffset) {
        let that = this;
        return that.authorize().then(function() {
            let get = Promise.promisify(that.sheets_api.spreadsheets.values.get);
            return get({
                auth: that.oauth2_client,
                spreadsheetId: that.sheet_id,
                range: (that.tab_name ? that.tab_name + '!' : '') + that._get_range_for_dimensions(x, y, xoffset, yoffset)
            })
        });
    }
};
