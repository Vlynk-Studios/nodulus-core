export default {
  modules: 'src/modules/*',
  prefix: '/api',
  aliases: {
    '@config': './src/config',
    '@middleware': './src/middleware'
  }
};
