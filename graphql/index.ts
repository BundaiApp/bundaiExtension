import { ApolloClient, InMemoryCache } from "@apollo/client";

const client = new ApolloClient({
  uri: "https://bundai-e3ba97c969b0.herokuapp.com/graphql", // remote server
  cache: new InMemoryCache({
    dataIdFromObject: (o) => o.id != null ? String(o.id) : undefined,
  }),
});

export default client
