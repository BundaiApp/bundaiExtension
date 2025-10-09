import { ApolloClient, InMemoryCache } from "@apollo/client"

const client = new ApolloClient({
  // uri: "https://bundai-e3ba97c969b0.herokuapp.com/graphql", // blueliner heroku server
  uri: "https://api.bundai.app/graphql", // digital ocean droplet server
  // uri: "http://localhost:3000/graphql", // local address
  cache: new InMemoryCache({
    dataIdFromObject: (o) => (o.id != null ? String(o.id) : undefined)
  })
})

export default client
