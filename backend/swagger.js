const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Predictive Maintenance Backend API',
      version: '1.0.0',
      description:
        'REST API for log ingestion, automated threshold evaluation, alert generation, and work order creation. ' +
        'Real-time alerts are pushed via Socket.IO event `alerts:new` from the same host/port as this API.',
    }
  },
  apis: ['./src/routes/*.js'], // Path to the API docs
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
