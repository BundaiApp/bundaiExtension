import { ApolloClient, InMemoryCache } from "@apollo/client"

const client = new ApolloClient({
  uri: "http://209.97.145.18/graphql", // remote server
  cache: new InMemoryCache({
    dataIdFromObject: (o) => (o.id != null ? String(o.id) : undefined)
  })
})

export default client
