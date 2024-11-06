import { log } from "../src/logging"

export function getuiversion(session) {
    if (session.user) return session.user.uiversion
    else return 'test'
}

export const validateemail = email => {
    // eslint-disable-next-line
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(email)
}

export const date2str = (x, y) => {
    var z = {
        M: x.getMonth() + 1,
        d: x.getDate(),
        h: x.getHours(),
        m: x.getMinutes(),
        s: x.getSeconds()
    };
    y = y.replace(/(M+|d+|h+|m+|s+)/g, function(v) {
        return ((v.length > 1 ? "0" : "") + z[v.slice(-1)]).slice(-2)
    });

    return y.replace(/(y+)/g, function(v) {
        return x.getFullYear().toString().slice(-v.length)
    });
}

export const dayofyear = (date) => {
    var start = new Date(date.getFullYear(), 0, 0);
    var diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
    var oneDay = 1000 * 60 * 60 * 24;
    var day = Math.floor(diff / oneDay);
    return day
}

export const botips = [/.*66.249.*./, /.*115.70.*./, /.*85.76.*./, /.*72.14.*./, /.*114.119.*./, /.*17.121.*./, /.*122.199.*./]
export const ignoreips = /.103.204.240.174./ //my ip

export const startOfDay = datetime => {
    if (datetime)
    return new Date(
            datetime.getFullYear(),
            datetime.getMonth(),
            datetime.getDate()
        )
    else return null
}

export const daylater = datetime => {
    if (datetime)
    return new Date(
        datetime.getFullYear(),
        datetime.getMonth(),
        datetime.getDate() + 1
    )
    else return null
}

export const startOfDayTZ = ({datetime, timezoneOffset}) => {
    if (datetime)
    return new Date(
            datetime.getFullYear(),
            datetime.getMonth(),
            datetime.getDate(),
            timezoneOffset
        )
    else return null
}

export function gettzdate({date, offset}) {
    date.setHours(date.getHours() + offset);
    return date;
}

export const endOfDayTZ = ({datetime, timezoneOffset}) => {
    if (datetime)
    return new Date(
            datetime.getFullYear(),
            datetime.getMonth(),
            datetime.getDate() + 1,
            timezoneOffset
        )
    else return null
}

export const shiftTZ = ({datetime, timezoneOffset}) => {
    // Convert the offset to milliseconds
    const offsetInMilliseconds = timezoneOffset * 60 * 60 * 1000;
  
    // Get the UTC time in milliseconds
    const utc = datetime.getTime();
  
    // Create a new Date object with the timezone offset applied
    const newDate = new Date(utc + offsetInMilliseconds);
  
    return newDate;
  }

  export const getWeekNumber = function (datetime) {
    //start of the week is Monday.
    var d = new Date(Date.UTC(datetime.getFullYear(), datetime.getMonth(), datetime.getDate()));
    var day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day)); // if day is 0 (Sunday), set it as 7
    var yearStart = new Date(Date.UTC(d.getFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

export const getWeekYear = function (datetime) {
    var d = new Date(Date.UTC(datetime.getFullYear(), datetime.getMonth(), datetime.getDate()));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getFullYear();
};

export const getStartDateFromWeek = function(week, year) {
    var d = new Date(Date.UTC(year, 0, 1));
    var dayNum = d.getUTCDay();
    var requiredDate = --week * 7;
    if (dayNum !== 1) {
        requiredDate += dayNum > 1 ? 8 - dayNum : 1;
    }
    d.setUTCDate(requiredDate);
    // Set the start date to the nearest Monday
    while (d.getUTCDay() !== 1) {
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
};

export const getEndDateFromWeek = function(week, year) {
    var d = getStartDateFromWeek(week, year);
    d.setUTCDate(d.getUTCDate() + 6);
    // Set the end date to the nearest Sunday
    while (d.getUTCDay() !== 0) {
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
};

export const longdatestring = date => {
    if (date) {
        return getweekday(date.getDay()) + ', ' + date.getDate() + ' ' + months[(date.getMonth())] + ' ' + date.getFullYear()
    } else {
        return ''
    }
}

export const getweekday = day => {
    switch (day) {
        case 0:
            return 'Sunday'
        case 1:
            return 'Monday'
        case 2:
            return 'Tuesday'
        case 3:
            return 'Wednesday'
        case 4:
            return 'Thursday'
        case 5:
            return 'Friday'
        case 6:
            return 'Saturday'
        default:
            return ''
    }
}

//return the month as name
const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
]


export function parseAndCombine(text) {
    try {
        // Replace single quotes with double quotes to make it valid JSON
        const jsonString = text.replace(/'/g, '"');

        // Match all text inside square brackets and parse them as JSON arrays
        const arrays = jsonString.match(/\[.*?\]/gs).map(str => JSON.parse(str));
        
        // Flatten the arrays into a single array
        const combinedArray = [].concat(...arrays);

        return combinedArray;
    } catch (error) {
        log({source: "parseAndCombine:", type: 'error', message: error});
        return []; // Return an empty array if there’s an error
    }
}