// Build marker — helps verify which code version is deployed
const BUILD_MARKER = 'hardened-v2-20260326';

class HealthService {
    /**
     * PUBLIC_INTERFACE
     * Returns the current service health status including build marker
     * for deployment verification.
     * @returns {{status:string, message:string, timestamp:string, environment:string, build:string}}
     */
    getStatus() {
      return {
        status: 'ok',
        message: 'Service is healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        build: BUILD_MARKER,
      };
    }
  }

module.exports = new HealthService();
