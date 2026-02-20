import { ApiProperty } from '@nestjs/swagger';
import { FraudAlertResponseDto } from './fraud-alert-response.dto';

/**
 * DTO for the GET /fraud/alerts and GET /fraud/alerts/:userId response payload
 * (inside the success envelope).
 */
export class FraudAlertListResponseDto {
  @ApiProperty({
    description: 'List of fraud alerts ordered by created_at descending',
    type: [FraudAlertResponseDto],
  })
  alerts: FraudAlertResponseDto[];

  @ApiProperty({
    description: 'Total number of alerts in the list',
    example: 1,
    type: 'number',
  })
  total: number;
}
