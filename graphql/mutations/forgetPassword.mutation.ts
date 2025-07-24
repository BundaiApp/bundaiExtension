import { gql } from "@apollo/client"

export default gql`
  mutation forgetPassword($email: String!) {
    forgetPassword(email: $email) {
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
