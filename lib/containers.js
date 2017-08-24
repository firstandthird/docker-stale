const async = require('async');

module.exports.getContainers = (docker, allDone) => {
  async.autoInject({
    containers(done) {
      docker.listContainers(done);
    },
    fieldItems(containers, done) {
      const allContainers = [];
      containers.forEach((containerInfo) => {
        const container = docker.getContainer(containerInfo.Id);
        container.Name = containerInfo.Names;
        allContainers.push({
          container,
          name: containerInfo.Names[0], // use the first name in the list
          created: containerInfo.Created
        });
      });
      return done(null, allContainers);
    }
  }, (err, result) => {
    if (err) {
      return allDone(err);
    }
    return allDone(null, result.fieldItems);
  });
};

module.exports.removeContainer = (log, container, allDone) => {
  container.container.stop((err) => {
    if (err) {
      log(err);
    }
    log(['stopped'], { id: container.name });
    container.remove((err2) => {
      if (err2) {
        log(err2);
      }
      log(['removed'], { id: container.name });
      allDone();
    });
  });
};
