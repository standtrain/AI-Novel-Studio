const configDao = require('../dao/configDao');

const configService = {
  async getAll() {
    return configDao.getAllDetailed();
  },

  async get(key) {
    return configDao.get(key);
  },

  async set(key, value) {
    await configDao.set(key, value);
    return { key, value };
  },
};

module.exports = configService;
