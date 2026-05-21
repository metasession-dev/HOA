import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@hoa.africa' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @MinLength(8)
  password: string;

  /**
   * Which front-end app the user is signing in from. The API uses this to
   * enforce the `User.enterpriseAccess` gate — a user without that flag
   * cannot sign in to the admin console even if their credentials are
   * valid. Sent automatically by both login pages. Omitting it skips the
   * gate (back-compat for older callers / CLI tools / tests).
   */
  @IsOptional()
  @IsIn(['enterprise', 'residents'])
  @ApiProperty({ enum: ['enterprise', 'residents'], required: false })
  app?: 'enterprise' | 'residents';
}
