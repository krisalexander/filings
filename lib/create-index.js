var CSON, Companies, Connection, _, async, buildSymbolIndex, fs, parseSymbolLine, path, ref, simplifyCompanyName;

path = require('path');

fs = require('fs');

async = require('async');

_ = require('underscore');

CSON = require('season');

ref = require('./filings'), Connection = ref.Connection, Companies = ref.Companies;

simplifyCompanyName = function(name) {
  return name.toLowerCase().replace(/[,.]|( inc(orporated)?)|( corp(oration)?)/gi, '').trim();
};

parseSymbolLine = function(line) {
  var cap, name, ref1, ref2, segments, symbol;
  segments = line.split('"');
  segments = _.reject(segments, function(segment) {
    segment = segment.trim();
    return !segment || segment === ',' || segment === '"';
  });
  symbol = (ref1 = segments[0]) != null ? ref1.trim() : void 0;
  if (!symbol) {
    return;
  }
  if (symbol.indexOf('/') !== -1) {
    return;
  }
  if (symbol.indexOf('^') !== -1) {
    return;
  }
  name = (ref2 = segments[1]) != null ? ref2.trim() : void 0;
  cap = parseFloat(segments[3]) || -1;
  if (name) {
    return {
      name: name,
      symbol: symbol,
      cap: cap
    };
  }
};

buildSymbolIndex = function(callback) {
  var indexCompanies, queue;
  indexCompanies = [];
  queue = async.queue(function(name, callback) {
    var indexPath;
    indexPath = path.resolve(__dirname, '..', name + ".csv");
    return fs.readFile(indexPath, 'utf8', function(error, contents) {
      var company, i, len, line, lines;
      if (error != null) {
        console.error(error);
        return callback(error);
      } else {
        lines = contents.split('\n');
        lines.shift();
        for (i = 0, len = lines.length; i < len; i++) {
          line = lines[i];
          company = parseSymbolLine(line);
          if (company) {
            indexCompanies.push(company);
          }
        }
        return callback();
      }
    });
  });
  queue.push('amex');
  queue.push('nasdaq');
  queue.push('nyse');
  return queue.drain = function() {
    return callback(indexCompanies);
  };
};

Connection.open(function(connection) {
  return Companies.fetch(connection, function(error, companies) {
    connection.close();
    if (error != null) {
      return console.error(error);
    } else {
      companies = _.uniq(companies, function(company) {
        return company.cik;
      });
      return buildSymbolIndex(function(indexCompanies) {
        var companiesWithSymbols, company, companyName, i, indexCompany, indexCompanyName, j, len, len1;
        companiesWithSymbols = [];
        for (i = 0, len = companies.length; i < len; i++) {
          company = companies[i];
          for (j = 0, len1 = indexCompanies.length; j < len1; j++) {
            indexCompany = indexCompanies[j];
            companyName = simplifyCompanyName(company.name);
            indexCompanyName = simplifyCompanyName(indexCompany.name);
            if (companyName === indexCompanyName) {
              company.symbol = indexCompany.symbol;
              company.cap = indexCompany.cap;
              companiesWithSymbols.push(company);
            }
          }
        }
        console.log('Companies that filed a 10-K:', companies.length);
        console.log('Companies on the NASDAQ, NYSE, and AMEX:', indexCompanies.length);
        console.log('Companies matched to their symbol:', companiesWithSymbols.length);
        companiesWithSymbols.sort(function(company1, company2) {
          if (company1.symbol < company2.symbol) {
            return -1;
          }
          if (company1.symbol > company2.symbol) {
            return 1;
          }
          return 0;
        });
        return CSON.writeFile(path.resolve('companies.json'), companiesWithSymbols);
      });
    }
  });
});

// ---
// generated by coffee-script 1.9.2
