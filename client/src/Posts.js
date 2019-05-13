import React, { Fragment } from "react";
import { Query } from "react-apollo";
import gql from "graphql-tag";

const GET_POSTS = gql`
  query {
    posts {
      _id
      title
    }
  }
`;

function Posts() {
  return (
    <div>
      <Query query={GET_POSTS}>
        {({ data, loading, error }) => {
          if (loading) return <h4>loading...</h4>;
          if (error) return <p>ERROR: {error.message}</p>;

          return (
            <div>
              <h1>Test</h1>
              <Fragment>
                {data.posts ? (
                  data.posts.map(post => <p key={post._id}>{post.title}</p>)
                ) : (
                  <p>No Posts yet</p>
                )}
              </Fragment>
            </div>
          );
        }}
      </Query>
    </div>
  );
}

export default Posts;
