const async = require('async');

module.exports.getServices = (docker, allDone) => {
  async.autoInject({
    services(done) {
      docker.listServices(done);
    },
    fieldItems(services, done) {
      const allServices = [];
      async.each(services, (serviceInfo, eachDone) => {
        const service = docker.getService(serviceInfo.ID);
        allServices.push({
          names: service.Names,
          serviceCreated: (new Date().getTime() - new Date(serviceInfo.CreatedAt).getTime()) / 1000
        });
      }, done);
      return done(null, {
      });
    }
  }, (err, result) => {
    if (err) {
      return allDone(err);
    }
    return allDone(null, result.fieldItems);
  });
};

module.exports.removeService = (log, service, done) => {
  service.remove((err) => {
    if (err) {
      log(err);
    }
    log(['removed'], { id: service.Name });
    done();
  });
};
