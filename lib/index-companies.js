var IndexCompanies, _, async, connection, fs, mkdirp, path, zlib,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

path = require('path');

fs = require('fs');

async = require('async');

mkdirp = require('mkdirp');

_ = require('underscore');

connection = require('./connection');

zlib = require('zlib');

module.exports = IndexCompanies = (function() {
  IndexCompanies.prototype.cacheDir = null;

  IndexCompanies.prototype.indexDir = null;

  IndexCompanies.prototype.companiesDir = null;

  IndexCompanies.prototype.copmaniesIndex = null;

  IndexCompanies.prototype.connection = null;

  function IndexCompanies() {
    this.indexCompanies = bind(this.indexCompanies, this);
    var ref;
    this.cacheDir = (ref = process.env.FILINGS_DIR) != null ? ref : path.join(process.env.HOME, '.filings');
    this.indexDir = path.join(this.cacheDir, 'full-index');
    this.companiesDir = path.join(this.cacheDir, 'companies');
    this.companiesIndex = path.join(this.companiesDir, 'index.json');
  }

  IndexCompanies.prototype.parseReportingCompanies = function(quarters, reportName) {
    var cik, companies, i, j, len, len1, line, quarter, ref, segments;
    companies = [];
    for (i = 0, len = quarters.length; i < len; i++) {
      quarter = quarters[i];
      ref = quarter.split('\n');
      for (j = 0, len1 = ref.length; j < len1; j++) {
        line = ref[j];
        segments = line.split('|');
        if (segments.length !== 5) {
          continue;
        }
        if (companies[segments[0]] != null) {
          continue;
        }
        if (segments[2] !== reportName) {
          continue;
        }
        if (!/^\d+$/.test(segments[0])) {
          continue;
        }
        cik = segments[0];
        companies.push({
          cik: cik,
          name: segments[1],
          path: "/" + (segments[4].slice(0, -4).replace(/-/g, ''))
        });
      }
    }
    return companies;
  };

  IndexCompanies.prototype.write = function(filePath, contents, callback) {
    return mkdirp(path.resolve(filePath, '..'), function(error) {
      if (error != null) {
        console.error(error);
        return callback(error);
      } else {
        return fs.writeFile(filePath, contents, function(error) {
          if (error != null) {
            console.error(error);
            return callback(error);
          } else {
            return callback();
          }
        });
      }
    });
  };

  IndexCompanies.prototype.writeGzip = function(filePath, contents, callback) {
    return zlib.gzip(contents, (function(_this) {
      return function(error, data) {
        return _this.write(filePath, data, callback);
      };
    })(this));
  };

  IndexCompanies.prototype.readGzip = function(filePath, callback) {
    return fs.readFile(filePath, {
      encoding: 'utf8'
    }, function(error, data) {
      if (error != null) {
        console.error(error);
        return callback(error);
      } else {
        return callback(null, data);
      }
    });
  };

  IndexCompanies.prototype.readMasterIndex = function(year, quarter, callback) {
    var cachePath;
    cachePath = path.join(this.indexDir, year, "Q" + quarter, 'master.gz');
    return fs.exists(cachePath, (function(_this) {
      return function(exists) {
        if (exists) {
          return _this.read(cachePath, function(error, data) {
            if (error != null) {
              return callback(error);
            } else {
              console.log("Using cached Q" + quarter + " index of companies");
              return callback(null, data, year, quarter);
            }
          });
        } else {
          return _this.connection.getGzip("/edgar/full-index/" + year + "/QTR" + quarter + "/master.gz", function(error, data) {
            if (error != null) {
              console.error(error);
              return callback(error);
            } else {
              return _this.writeGzip(cachePath, data, function(error) {
                if (error != null) {
                  return callback(error);
                } else {
                  console.log("Downloaded Q" + quarter + " index of companies");
                  return callback(null, data, year, quarter);
                }
              });
            }
          });
        }
      };
    })(this));
  };

  IndexCompanies.prototype.indexCompanies = function() {
    var i, quarter, quarterIndices, queue, results, year;
    year = "" + (new Date().getFullYear() - 1);
    console.log("Indexing companies that filed a 10K in " + year);
    quarterIndices = [];
    queue = async.queue((function(_this) {
      return function(quarter, callback) {
        return _this.readMasterIndex(year, quarter, function(error, data, year, quarter) {
          if (error) {
            console.error(error);
          } else {
            quarterIndices[quarter - 1] = data;
          }
          return callback(error);
        });
      };
    })(this));
    queue.drain = (function(_this) {
      return function() {
        var companies, company, i, len, missingCompanies, reportPath, symbolsDownloaded;
        _this.connection.close();
        quarterIndices.reverse();
        companies = _this.parseReportingCompanies(quarterIndices, '10-K');
        missingCompanies = [];
        for (i = 0, len = companies.length; i < len; i++) {
          company = companies[i];
          reportPath = path.join(_this.companiesDir, company.cik, year, '10-K.xml');
          if (!fs.existsSync(reportPath)) {
            missingCompanies.push(company);
          }
        }
        console.log("Downloading " + missingCompanies.length + " company ticker symbols");
        symbolsDownloaded = 0;
        return connection.pool(5, function(connections) {
          var j, len1, results, tickerQueue;
          tickerQueue = async.queue(function(company, callback) {
            connection = connections.pop();
            return connection.list(company.path, function(error, files) {
              var file, j, len1, match, reportName;
              if (files == null) {
                files = [];
              }
              if (error != null) {
                console.error(error);
              }
              for (j = 0, len1 = files.length; j < len1; j++) {
                file = files[j];
                if (match = file != null ? file.name.match(/^([a-zA-Z]+)-\d+\.xml$/) : void 0) {
                  reportName = match[0];
                  company.symbol = match[1];
                  break;
                }
              }
              if (reportName) {
                return connection.getString(company.path + "/" + reportName, function(error, data) {
                  if (error != null) {
                    console.error(error);
                    connections.push(connection);
                    return callback();
                  } else {
                    reportPath = path.join(_this.companiesDir, company.cik, year, '10-K.xml');
                    return _this.write(reportPath, data, function(error) {
                      symbolsDownloaded++;
                      process.stdout.write("\r" + symbolsDownloaded + "/" + missingCompanies.length);
                      connections.push(connection);
                      return callback();
                    });
                  }
                });
              } else {
                connections.push(connection);
                return callback();
              }
            });
          });
          tickerQueue.concurrency = connections.length;
          tickerQueue.drain = function() {
            var j, len1;
            for (j = 0, len1 = connections.length; j < len1; j++) {
              connection = connections[j];
              connection.close();
            }
            return _this.write(_this.companiesIndex, JSON.toString(companies));
          };
          results = [];
          for (j = 0, len1 = missingCompanies.length; j < len1; j++) {
            company = missingCompanies[j];
            results.push(tickerQueue.push(company));
          }
          return results;
        });
      };
    })(this);
    results = [];
    for (quarter = i = 1; i <= 4; quarter = ++i) {
      results.push(queue.push(quarter));
    }
    return results;
  };

  IndexCompanies.prototype.run = function() {
    return this.connection = connection.open(this.indexCompanies);
  };

  return IndexCompanies;

})();

// ---
// generated by coffee-script 1.9.2
