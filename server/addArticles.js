const mongoose = require('mongoose');
const axios = require('axios');
const db = require('../database/index');
const dict = require('../reference/dictionary');
const config = require('../config/config'); // PRIVATE FILE - DO NOT COMMIT!

const Article = db.Article;
const stateDict = dict.stateDict;
const countryDict = dict.countryDict;
const WEBHOSE_API_KEY = config['WEBHOSE_API_KEY'];

/*~~~ COUNTRY AND STATE ~~~*/
const getQueryStr = (code, type) => {
  let refObj, countryCode;
  if (type === 'state') { 
    refObj = stateDict;
    countryCode = 'US';
  } else {
    refObj = countryDict;
    countryCode = code;
  }
  const locationStr = refObj[code];
  const timeNow = new Date().getTime(); // time in Unix Epoch ms...
  const timeSpan = timeNow - (86400000 * 30); // 86400000ms in a day

  return 'http://webhose.io/filterWebContent?token='+
          WEBHOSE_API_KEY +
          '&format=json&ts=' +
          timeSpan +
          '&sort=published&q=is_first:true language:english published:>' +
          timeSpan +
          ' site_type:news thread.country:' +
          countryCode +
          ' performance_score:>7 location:"' +
          locationStr +
          '"';
}

const getArticles = (code, type) => {
  const queryString = getQueryStr(code, type);

  axios.get(queryString)
  .then(result => {
    const totalResults = result.data.totalResults;
    console.log(totalResults, 'articles rec\'d for', type, code, 'in hose-response');

    if ( totalResults > 0 ){
      clearArticles(code, type);
    } else {
      console.log('ZERO NEW Articles for', type, code, ', leaving STALE DATA as is.');
    }

    const arrOfArticleObj = result.data.posts;
    arrOfArticleObj.forEach(articleObj => {
      const inbound = new Article({
        uuid: articleObj.uuid,
        date: articleObj.published,
        text: articleObj.text,
        title: articleObj.title,
        url: articleObj.url
      });
      const codeType = type === 'state' ? 'stateCode' : 'countryCode';
      inbound[codeType] = code;
      inbound.save(err => {
        if (err) { console.error(err); }  //otherwise...
        console.log('saved uuid-', articleObj.uuid);
      });
    });
  })
  .catch(error => { console.error('ERROR!!! For', type, code, '-->', error); });
};

const clearArticles = (code, type) => {
  const codeObj = type === 'state' ? { 'stateCode': code } : { 'countryCode': code };
  Article.find(codeObj)
         .remove(() => { console.log('Cleared', type, code, 'from DB'); });
}

const articleRefresh = (type) => {
  // UNCOMMENT next line to loop through all, currently limiting API calls
  // const refObj = type === 'state' ? stateDict : countryDict;
  // then COMMENT out below line
  const refObj = type === 'state' ? { 'AL': 'Alabama', 'MD': 'Maryland' } : { 'CN': 'China', 'JP': 'Japan' };
  let i = 0;
  for (let key in refObj) {
    i += 1000;
    setTimeout(() => { getArticles(key, type) }, i);
  }
};

module.exports = articleRefresh;
