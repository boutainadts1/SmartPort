function isKafkaEnabled() {
  return String(process.env.KAFKA_ENABLED || '').toLowerCase() === 'true';
}

module.exports = { isKafkaEnabled };
