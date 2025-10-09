import { gql } from '@apollo/client'

const RESEND_VERIFICATION = gql`
  mutation ResendVerification($userId: String!) {
    resendVerification(userId: $userId) {
      token
      user {
        _id
        email
        name
      }
      errorMessage
    }
  }
`

export default RESEND_VERIFICATION