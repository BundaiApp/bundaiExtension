import { gql } from "@apollo/client"

export default gql`
  mutation logIn($email: String!, $password: String!) {
    logIn(email: $email, password: $password) {
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
