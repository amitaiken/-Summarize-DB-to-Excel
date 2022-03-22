/* xlsx.js (C) 2013-present SheetJS -- http://sheetjs.com */
const XLSX = require('xlsx');
const fs = require('fs');

const DayMultiplier = 60*60*24*1000;

function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

Array.prototype.insert = function ( index, item ) {
    this.splice( index, 0, item );
};

Date.prototype.addDays = function(days) {
    let date = new Date(this.valueOf());
    date.setDate(date.getDate() + days);
    return date;
}

function getDatesBetween(startDate, stopDate) {
    let dateArray = new Array();
    let currentDate =  new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDay());
    while (currentDate <= stopDate) {
        dateArray.push(new Date (currentDate));
        currentDate = currentDate.addDays(1);
    }
    return dateArray;
}

class XLSXGenerator {
    constructor(req, res) {
        console.log("XLSXGenerator Class is loading ... ");
        this.reportData = req;
    }
    async createExcelAttendanceReport(reportData, fileName){
        try {
            let wb = XLSX.utils.book_new();
            wb.Props = {
                Title: fileName,
                Author: "Generate by voiCenter machine",
                CreatedDate: new Date(Date.now())
            };
            const startDate =  new Date(this.reportData.StartDate); //new Date((Date.now()) - DayMultiplier*30 );//if() issuesIntervalData.StartDate;
            const endDate = new Date(this.reportData.EndDate); //new Date(Date.now());
            console.log('EndDate', endDate, 'StartDate', startDate)
            const headers = getDatesBetween(startDate, endDate);
            let issuesIntervalData = this.reportData.Data;
            Object.keys(issuesIntervalData).forEach(key => {
                const workerData = issuesIntervalData[key];
                const workerSheetData = new WorkerTableSheet(headers);
                /* fill jira issue lines */
                workerSheetData.fillJiraLines(workerData);
                /* Add total line */
                workerSheetData.summarizeDateTimeWork(workerData);
                //workerSheetData.defineCellsAsTime(workerData);
                XLSX.utils.book_append_sheet(wb, workerSheetData.worksheet, key);
            });
            const excelBuffer = XLSX.write(wb, {bookType: 'xlsx', type: 'array'} );
            const date = Date.now();
            let f = XLSX.writeFile(wb, String(date + fileName));
            const excelFile = new Buffer.from(excelBuffer, "binary");
            return excelFile;
        } catch (e) {
            console.log(e);
        }
    }
}

class WorkerTableSheet {
    countHeaders = 0;
    countLines = 0;
    headers = [];
    workerXLSXLines = [];
    headerLine = [];
    firstColumn = {name: 'JiraIssues/Dates'};
    lineNames = [];
    worksheet = [];
    constructor(headers) {
        this.headers = headers;
        headers.forEach(header => {
            const date = header;
            this.headerLine.push(date);
            this.countHeaders += 1;
        });
        this.worksheet =  XLSX.utils.json_to_sheet(this.headerLine);
        /* fix headers */
        XLSX.utils.sheet_add_aoa(this.worksheet, [this.headerLine], { origin: "A1" });
        XLSX.utils.sheet_add_aoa(this.worksheet, [['JiraIssues/Dates']], { origin: "A1" });
        XLSX.utils.sheet_add_aoa(this.worksheet, [['Issue total work']], { origin: {c:this.countHeaders ,r:0} });
        /* column width */
        this.worksheet["!cols"] = [ {wch:25} ];
        for(let i=0; i<headers.length; i++) {
            this.worksheet["!cols"].push({wch: 15});
        }
    }

     fillJiraLines(workerData) {
        workerData.forEach(workerJira => {
            const jiraIssues = [];
            let issueTotalWork = 0;
            const jiraIssue = workerJira.project_name + '-' + workerJira.issueid;
            jiraIssues.push(jiraIssue);
            const jiraTaskList = workerJira.TaskList;
            const taskListLength = jiraTaskList.length;
            this.countLines += taskListLength;
            let taskIndex = 0;
            for (let i = 0;  i<this.countHeaders-1; i++) {
                let timeWork = 0;
                if (taskIndex < taskListLength) {
                    let currentTaskDate = new Date(jiraTaskList[taskIndex].logYear, (jiraTaskList[taskIndex].logMonth - 1), jiraTaskList[taskIndex].logDay);
                    if ((this.headers[i]).getTime() === currentTaskDate.getTime()) {
                        timeWork = jiraTaskList[taskIndex].timeworked
                        issueTotalWork += timeWork;
                        taskIndex += 1;
                    }
                }
                //timeWork = getTimeFormat(timeWork);
                jiraIssues.push(timeWork);
            }
            jiraIssues.push(issueTotalWork);
            this.workerXLSXLines.push(jiraIssues);
        });
        XLSX.utils.sheet_add_aoa(this.worksheet,this.workerXLSXLines,{origin: "A2"});
    }
    summarizeDateTimeWork(workerData) {
        let sumLine = [];
        const totalLineIndex = workerData.length;
        for (let i = 1;  i<(this.countHeaders+1) ; i++) {
            let totalDateTime = 0;
            for(let j = 0; j<totalLineIndex; j++) {
                if (this.workerXLSXLines[j][i]) totalDateTime += this.workerXLSXLines[j][i];    //&& this.workerXLSXLines[i][j]>0
            }
            sumLine.push(totalDateTime);
        }
        const targetCell =  {c:1, r:(totalLineIndex+1)};
        XLSX.utils.sheet_add_aoa(this.worksheet, [sumLine], { origin: targetCell });
        const totalTitleIndex = {c:0, r:(totalLineIndex+1)};
        XLSX.utils.sheet_add_aoa(this.worksheet, [['Total']], { origin: totalTitleIndex });
    }

    defineCellsAsTime(workerData) {
        //let TimeCellsRange = {s:{c:1,r:1},e:{c:(this.countHeaders+1),r:(this.countLines+1)}};
        let columnLetter;
        const lettersIndex = ['B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','A']
        for (let i = 1;  i<(this.countHeaders+2) ; i++) {
            columnLetter = '';
            let tempLetterIndex = i;
            do {
                columnLetter += lettersIndex[tempLetterIndex % lettersIndex.length];
                tempLetterIndex = tempLetterIndex - lettersIndex.length;
            } while (tempLetterIndex > 0);
            for(let j = 2; j<this.countLines+1; j++) {
                const cellAddress = columnLetter + j;
                let cell = this.worksheet[cellAddress];
                if (cell) {
                    delete cell.w;
                    cell.z = 'h:mm:ss';
                    XLSX.utils.format_cell(cell);
                }
                //this.worksheet[cellAddress].z = 21;
            }
        }
    }
}

module.exports = XLSXGenerator;

