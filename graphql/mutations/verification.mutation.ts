import { gql } from '@apollo/client'

const VERIFY = gql`
  mutation verify($passCode: Int!, $userId: String!) {
    verify(passCode: $passCode, userId: $userId) {
      token
      user {
        _id
        email
        name
        isVerified
      }
      errorMessage
    }
  }
`

export default VERIFY