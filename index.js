const { google } = require("googleapis");
const { Storage } = require("@google-cloud/storage");

exports.csv2sheet = async (data, context) => {
  var filename = data.name;
  if (!filename.endsWith(".csv")) {
    console.log("Not a .csv file, ignoring.");
    return;
  }

  // define name of new sheet
  const sheetName = filename.slice(0, -4);

  // block on auth + getting the sheets API object
  const auth = await google.auth.getClient({
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/devstorage.read_only"
    ]
  });

  const sheetsAPI = google.sheets({ version: 'v4', auth });

  function addEmptySheet(sheetName) {
    return new Promise((resolve, reject) => {
      const emptySheetParams = {
        spreadsheetId: process.env.SPREADSHEET_ID,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                  index: 1,
                  gridProperties: {
                    rowCount: 2000,
                    columnCount: 26,
                    frozenRowCount: 1
                  }
                }
              }
            }
          ]
        }
      };
      sheetsAPI.spreadsheets.batchUpdate(emptySheetParams, function (err, response) {
        if (err) {
          reject("The Sheets API returned an error: " + err);
        } else {
          const sheetId = response.data.replies[0].addSheet.properties.sheetId;
          console.log("Created empty sheet: " + sheetId);
          resolve(sheetId);
        }
      });
    });
  }

  function readCSVContent(file) {
    return new Promise((resolve, reject) => {
      const storage = new Storage();
      let fileContents = new Buffer('');
      storage.bucket(file.bucket).file(file.name).createReadStream()
        .on('error', function (err) {
          reject('The Storage API returned an error: ' + err);
        })
        .on('data', function (chunk) {
          fileContents = Buffer.concat([fileContents, chunk]);
        })
        .on('end', function () {
          let content = fileContents.toString('utf8');
          console.log("CSV content read as string : " + content);
          resolve(content);
        });
    });
  }

  function populateAndStyle(theData, sheetId) {
    return new Promise((resolve, reject) => {
      // Using 'batchUpdate' allows for multiple 'requests' to be sent in a single batch.
      // Populate the sheet referenced by its ID with the data received (a CSV string)
      // Style: set first row font size to 11 and to Bold. Exercise left for the reader: resize columns
      const dataAndStyle = {
        spreadsheetId: process.env.SPREADSHEET_ID,
        resource: {
          requests: [
            {
              pasteData: {
                coordinate: {
                  sheetId: sheetId,
                  rowIndex: 0,
                  columnIndex: 0
                },
                data: theData,
                delimiter: ","
              }
            },
            {
              repeatCell: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      fontSize: 11,
                      bold: true
                    }
                  }
                },
                fields: "userEnteredFormat(textFormat)"
              }
            }
          ]
        }
      };

      sheetsAPI.spreadsheets.batchUpdate(dataAndStyle, function (err, response) {
        if (err) {
          reject("The Sheets API returned an error: " + err);
        } else {
          console.log(sheetId + " sheet populated with " + theData.length + " rows and column style set.");
          resolve();
        }
      });
    });
  }
  const sheetId = await addEmptySheet(sheetName);
  const theData = await readCSVContent(data);
  await populateAndStyle(theData, sheetId);
}