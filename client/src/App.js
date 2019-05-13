import React from "react";
import logo from "./logo.svg";
import "./App.css";

import { ApolloClient } from "apollo-client";
import { ApolloProvider } from "react-apollo";
import { InMemoryCache } from "apollo-cache-inmemory";
import { HttpLink } from "apollo-link-http";
import Posts from "./Posts.js";
import gql from "graphql-tag";

const cache = new InMemoryCache();
const link = new HttpLink({
  uri: "http://localhost:3001/graphql"
});

const client = new ApolloClient({
  cache,
  link
});

function App() {
  return (
    <ApolloProvider client={client}>
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <Posts />
        </header>
      </div>
    </ApolloProvider>
  );
}

export default App;

/* export default function Launches() {
  return (
    <Query query={GET_LAUNCHES}>
      {({ data, loading, error }) => {
        if (loading) return <div>loading...</div>;
        if (error) return <p>ERROR</p>;

        return (
          <Fragment>
            {data.launches &&
              data.launches.launches &&
              data.launches.launches.map(launch => ({
                // <LaunchTile key={launch.id} launch={launch} /> 
              }))}
          </Fragment>
        );
      }}
    </Query>
  );
} */
// ... above is the instantiation of the client object.

client
  .query({
    query: gql`
      query {
        posts {
          _id
        }
      }
    `
  })
  .then(result => console.log(result));
