import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class InitAuction1773160752712 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'auctions',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'main_image_url',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'starting_price',
            type: 'bigint',
            unsigned: true,
          },
          {
            name: 'current_price',
            type: 'bigint',
            unsigned: true,
          },
          {
            name: 'start_time',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'end_time',
            type: 'timestamp',
          },
          {
            name: 'started_at',
            type: 'timestamp',
            isNullable: true,
            default: null,
          },
          {
            name: 'ended_at',
            type: 'timestamp',
            isNullable: true,
            default: null,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['PENDING', 'ACTIVE', 'ENDED', 'CANCELED'],
            default: "'PENDING'",
          },
          {
            name: 'owner_id',
            type: 'int',
          },
          {
            name: 'winner_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'auctions',
      new TableForeignKey({
        columnNames: ['owner_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
        name: 'FK_AUCTIONS_OWNER_ID',
      }),
    );

    await queryRunner.createForeignKey(
      'auctions',
      new TableForeignKey({
        columnNames: ['winner_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
        name: 'FK_AUCTIONS_WINNER_ID',
      }),
    );

    await queryRunner.createIndices('auctions', [
      new TableIndex({
        name: 'IDX_AUCTIONS_STATUS_END_TIME',
        columnNames: ['status', 'end_time'],
      }),
      new TableIndex({
        name: 'IDX_AUCTIONS_OWNER_ID',
        columnNames: ['owner_id'],
      }),
      new TableIndex({
        name: 'IDX_AUCTIONS_WINNER_ID',
        columnNames: ['winner_id'],
      }),
      new TableIndex({
        name: 'IDX_AUCTIONS_STATUS',
        columnNames: ['status'],
      }),
      new TableIndex({
        name: 'IDX_AUCTIONS_STATUS_START_TIME',
        columnNames: ['status', 'start_time'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_STATUS');
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_WINNER_ID');
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_OWNER_ID');
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_STATUS_END_TIME');
    await queryRunner.dropIndex('auctions', 'IDX_AUCTIONS_STATUS_START_TIME');

    await queryRunner.dropForeignKey('auctions', 'FK_AUCTIONS_WINNER_ID');
    await queryRunner.dropForeignKey('auctions', 'FK_AUCTIONS_OWNER_ID');

    await queryRunner.dropTable('auctions');
  }
}
