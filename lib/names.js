var capitalizeAll;

capitalizeAll = require('humanize-plus').capitalizeAll;

module.exports = {
  normalize: function(name) {
    var i, index, len, segment, segments;
    if (name == null) {
      name = '';
    }
    name = name.toLowerCase();
    segments = name.split(' ');
    segments.push(segments.shift());
    for (index = i = 0, len = segments.length; i < len; index = ++i) {
      segment = segments[index];
      if (segment.length === 1) {
        segments[index] = segment + ".";
      }
    }
    return capitalizeAll(segments.join(' '));
  }
};

// ---
// generated by coffee-script 1.9.2