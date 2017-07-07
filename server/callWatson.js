const db = require('../database');
const ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3');
const credentials = require('../config/config'); // PRIVATE FILE - DO NOT COMMIT!
const dict = require('../reference/dictionary'); // stateDict, countryDict

const stateDict = dict.stateDict;
const countryDict = dict.countryDict;
const today = new Date.getTime();
const timePeriods = {
  day: today - 86400000,
  week: today - 86400000 * 7,
  month: today - 86400000 * 30
}

// create instance of Tone Analyzer service
const toneAnalyzer = new ToneAnalyzerV3({
  username: credentials.WATSON_TA_USERNAME,
  password: credentials.WATSON_TA_PASSWORD,
  version_date: '2016-05-19'
});

const params = {
  // Get the text from the JSON file.
  text: require(__dirname + '/../apis/news-sample.json').text,
  tones: 'emotion', // omit for all three, comma separated listtones: 'emotion', // omit for all three, comma separated list
  sentences: false
};

// stores state and tone data
// format {az: {joy: 0, fear: 0, disgust: 0}, ca: {joy...}}
const finalObj = {};

const makeAvg = (obj, divisor) => {
  for (const tone in obj) {
    obj[tone] = obj[tone] / divisor * 100;
  }
};

const callWatsonForScores = (articlesArr, finalObj, place, period, cb) => {
  // only run cb if there are articles about that stat/country - cb assures makeAvg and adding to db happens after watson data is returned
  // counter checks that all articles have been analyzed
  let counter = 0;
  console.log('analyzing', articlesArr.length, 'articles in Watson for', place);

  //loop through all time frames
  for (let period in timePeriods) {
    articlesArr.forEach((article, index) => {
      params.text = article.text;
      toneAnalyzer.tone(params, (err, res) => {
        if (err) { 
          console.log('Watson: Error retreiving tone analysis', err); 
        } else {
          counter++;

          // index of tone according to Watson response
          const angerScore = res.document_tone.tone_categories[0].tones[0].score;
          const disgustScore = res.document_tone.tone_categories[0].tones[1].score;
          const fearScore = res.document_tone.tone_categories[0].tones[2].score;
          const joyScore = res.document_tone.tone_categories[0].tones[3].score;
          const sadnessScore = res.document_tone.tone_categories[0].tones[4].score;
          // sum az's scores
          finalObj[place].anger = finalObj[place].anger + angerScore;
          finalObj[place].disgust = finalObj[place].disgust + disgustScore;
          finalObj[place].fear = finalObj[place].fear + fearScore;
          finalObj[place].joy = finalObj[place].joy + joyScore;
          finalObj[place].sadness = finalObj[place].sadness + sadnessScore;

          //if last article or next article falls out of time period
          const nextDate = new Date(articlesArr[index].date);
          const nextMS = nextDate.getTime();
          if (counter === articlesArr.length || nextMS < period) { cb(); }
        }
      });
    });
  }

};

/*~~~ COUNTRY AND STATE ~~~*/
const addTones = (type) => {
  const collection = type === 'state' ? 'StateTone' : 'CountryTone'; 
  const codeType = type === 'state' ? 'stateCode' : 'countryCode'; 
  // UNCOMMENT next line to loop through all, currently limiting API calls
  // const refObj = req.query.scope === 'state' ? stateDict : countryDict;
  // then COMMENT out below line
  const refObj = type === 'state' ? { 'AL': 'Alabama', 'MD': 'Maryland' } : { 'CN': 'China', 'JP': 'Japan' };

  // remove existing document from db
  db[collection].remove().then( () => {

    // loop through states/countries
    for (let code in refObj) {

      // find all articles about state/country in db within time frame
      const codeObj = type === 'state' ? { 'stateCode': code } : { 'countryCode': code };
      codeObj.date = { $gt: timePeriods[period] };

      db.Article.find(codeObj, (err, allArticles) => {
        if (err) { 
          console.log(`Error getting ${code} articles in db`, err); 
        } else {
            finalObj[code] = {
              day: {},
              week: {},
              month: {}
            };
            // run analyzer on all articles about state/country, add to finalObj
            callWatsonForScores(allArticles, finalObj, code, () => {
              // avg scores for state/country
              for (let )
              makeAvg(finalObj[code], allArticles.length);

              // create document
              const newTone = new db[collection]({
                tones: {
                  period: period,
                  levels: {
                    anger: finalObj[code].anger, 
                    disgust: finalObj[code].disgust, 
                    fear: finalObj[code].fear, 
                    joy: finalObj[code].joy, 
                    sadness: finalObj[code].sadness
                  }
                }
              });
              newTone[type] = code;
              newTone.save((err, result) => {
                if (err) { console.log(`There was an error saving ${code}'s tone data`); } 
              });
            });
          }
        }
      });
    };
  });
};

module.exports = addTones;
