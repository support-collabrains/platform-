class JSDOM {
  constructor() {
    this.window = { document: {}, Node: {}, Element: {}, HTMLElement: {} };
  }
}
module.exports = { JSDOM };
