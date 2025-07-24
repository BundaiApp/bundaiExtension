import gql from "graphql-tag";

export default gql`
  mutation signUp($email: String!, $password: String!, $username: String!) {
    signUp(email: $email, password: $password, username: $username) {
      token
      errorMessage
      user {
        _id
        email
        name
      }
    }
  }
`;
