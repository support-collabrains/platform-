const sanitizer = (_win) => ({
  sanitize: (html, opts) => {
    if (!html) return '';
    let result = html;
    for (const tag of (opts && opts.FORBID_TAGS) || []) {
      result = result.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
      result = result.replace(new RegExp(`<${tag}[^>]*/?>`, 'gi'), '');
    }
    for (const attr of (opts && opts.FORBID_ATTR) || []) {
      result = result.replace(new RegExp(` ${attr}="[^"]*"`, 'gi'), '');
      result = result.replace(new RegExp(` ${attr}='[^']*'`, 'gi'), '');
      result = result.replace(new RegExp(` ${attr}\\b`, 'gi'), '');
    }
    return result;
  },
});
module.exports = sanitizer;
module.exports.default = sanitizer;
