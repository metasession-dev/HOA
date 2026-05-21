import { Field, ID, ObjectType, registerEnumType, Float } from '@nestjs/graphql';

/**
 * Phase 9.1 GraphQL types. Code-first via @nestjs/graphql. We mirror only
 * the safe-to-expose shape of each Prisma model — never raw rows. Decimals
 * are serialised as strings (precision-safe) and dates as ISO strings.
 *
 * Add a type here whenever you want to expose a new entity through GraphQL.
 * The resolver in `query.resolver.ts` decides scoping; this file just
 * describes shape.
 */

@ObjectType()
export class OrganizationGQL {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() slug!: string;
  @Field() currency!: string;
  @Field() country!: string;
  @Field() timezone!: string;
  @Field() language!: string;
  @Field() createdAt!: string;
}

@ObjectType()
export class EstateGQL {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) address?: string | null;
  @Field(() => Float) totalUnits!: number;
}

@ObjectType()
export class UnitGQL {
  @Field(() => ID) id!: string;
  @Field() unitNumber!: string;
  @Field(() => String, { nullable: true }) block?: string | null;
  @Field(() => Float, { nullable: true }) floor?: number | null;
  @Field() type!: string;
  @Field(() => [String]) tags!: string[];
  @Field(() => ID) estateId!: string;
}

@ObjectType()
export class InvoiceGQL {
  @Field(() => ID) id!: string;
  @Field() invoiceNumber!: string;
  @Field() type!: string;
  @Field() amount!: string;
  @Field() currency!: string;
  @Field() status!: string;
  @Field() dueDate!: string;
  @Field(() => String, { nullable: true }) paidAt?: string | null;
  @Field(() => String, { nullable: true }) sentAt?: string | null;
  @Field(() => ID) unitId!: string;
  @Field() createdAt!: string;
}

@ObjectType()
export class PaymentGQL {
  @Field(() => ID) id!: string;
  @Field() amount!: string;
  @Field() currency!: string;
  @Field() method!: string;
  @Field() status!: string;
  @Field(() => String, { nullable: true }) processedAt?: string | null;
  @Field(() => String, { nullable: true }) processorReference?: string | null;
  @Field(() => ID) invoiceId!: string;
}

@ObjectType()
export class RequestGQL {
  @Field(() => ID) id!: string;
  @Field() subject!: string;
  @Field() body!: string;
  @Field() status!: string;
  @Field() priority!: string;
  @Field(() => ID, { nullable: true }) unitId?: string | null;
  @Field(() => ID) categoryId!: string;
  @Field(() => String, { nullable: true }) dueAt?: string | null;
  @Field(() => String, { nullable: true }) resolvedAt?: string | null;
  @Field() createdAt!: string;
}

@ObjectType()
export class BroadcastGQL {
  @Field(() => ID) id!: string;
  @Field() subject!: string;
  @Field() status!: string;
  @Field(() => [String]) channels!: string[];
  @Field(() => String, { nullable: true }) scheduledAt?: string | null;
  @Field(() => String, { nullable: true }) sentAt?: string | null;
  @Field(() => Float) resolvedRecipients!: number;
  @Field(() => Float) successCount!: number;
  @Field(() => Float) failureCount!: number;
  @Field(() => Float) optOutCount!: number;
}

@ObjectType()
export class PageInfoGQL {
  @Field(() => Float) total!: number;
  @Field(() => Float) page!: number;
  @Field(() => Float) limit!: number;
  @Field(() => Float) totalPages!: number;
}

@ObjectType()
export class InvoicesPageGQL {
  @Field(() => [InvoiceGQL]) data!: InvoiceGQL[];
  @Field(() => PageInfoGQL) meta!: PageInfoGQL;
}
