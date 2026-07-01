import { Query, Resolver } from '@nestjs/graphql';

/**
 * Stub resolver so GraphQL schema is valid (requires at least one Query).
 * This will be replaced with real resolvers in task 5.1.
 * TODO(task-5.1): Remove this once real resolvers are registered.
 */
@Resolver()
export class StubResolver {
  @Query(() => Boolean)
  _health(): boolean {
    return true;
  }
}
