import 'babel-core/register'
import 'babel-polyfill' //required for production build.
import { graphql } from './graphqlserver'
graphql()
