const { ApolloClient, InMemoryCache } = require("@apollo/client");

const client = new ApolloClient({
  uri: "https://bundai-e3ba97c969b0.herokuapp.com/graphql", // remote server
  cache: new InMemoryCache({
    dataIdFromObject: (o) => o.id,
  }),
});

module.exports = client;
