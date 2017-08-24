const async = require('async');

module.exports.getServices = (docker, allDone) => {
  async.autoInject({
    services(done) {
      docker.listServices(done);
    },
    fieldItems(services, done) {
      const allServices = [];
      async.eachSeries(services, (serviceInfo, eachDone) => {
        const service = docker.getService(serviceInfo.ID);
        allServices.push({
          service,
          name: serviceInfo.Spec.Name,
          created: (new Date().getTime() - new Date(serviceInfo.CreatedAt).getTime()) / 1000
        });
        eachDone();
      });
      return done(null, allServices);
    }
  }, (err, result) => {
    if (err) {
      return allDone(err);
    }
    return allDone(null, result.fieldItems);
  });
};

module.exports.removeService = (log, service, done) => {
  service.service.remove((err) => {
    if (err) {
      log(err);
    }
    log(['removed'], { id: service.name });
    done();
  });
};
