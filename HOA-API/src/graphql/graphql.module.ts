import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import * as path from 'path';
import { QueryResolver } from './query.resolver';
import { PrismaService } from '../common/prisma.service';

/**
 * Phase 9.1 GraphQL gateway.
 *
 * Code-first schema generation. Schema file emitted to ./schema.gql so the
 * SDK generators (Phase 9.3) can codegen against it.
 *
 * RBAC: the same global JwtAuthGuard chain runs on `/graphql` because we
 * don't bypass any of Nest's pipeline. Each resolver also slaps
 * `@UseGuards(JwtAuthGuard)` so the metadata is explicit at the call site
 * — even if a future refactor removes the global guard, GraphQL stays safe.
 */
@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      // Generate the schema file alongside src so codegen tools can pick it up.
      autoSchemaFile: path.join(process.cwd(), 'schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
      // CORS lives at the Nest level; Apollo just passes through.
      context: ({ req }) => ({ req }),
      // Don't crash the whole app if a resolver throws — let Nest's filter
      // log + return a sanitized error.
      formatError: (err) => ({
        message: err.message,
        path: err.path,
        extensions: { code: err.extensions?.code },
      }),
    }),
  ],
  providers: [QueryResolver, PrismaService],
})
export class GraphqlModule {}
