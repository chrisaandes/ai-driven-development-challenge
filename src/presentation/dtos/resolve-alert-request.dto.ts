import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body DTO for PUT /api/v1/fraud/alerts/:id/resolve.
 */
export class ResolveAlertRequestDto {
  @ApiPropertyOptional({
    description: 'Notes describing the resolution action taken',
    example: 'Verified with user, legitimate transaction',
    maxLength: 500,
    type: 'string',
  })
  @IsOptional()
  @IsString({ message: 'resolution_notes must be a string' })
  @MaxLength(500, { message: 'resolution_notes cannot exceed 500 characters' })
  resolution_notes?: string;
}
