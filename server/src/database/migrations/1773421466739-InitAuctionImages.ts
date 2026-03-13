import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class InitAuctionImages1773421466739 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'auction_images',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'auction_id',
            type: 'int',
          },
          {
            name: 'image_url',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'is_primary',
            type: 'boolean',
            default: false,
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
      'auction_images',
      new TableForeignKey({
        columnNames: ['auction_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'auctions',
        onDelete: 'CASCADE',
        name: 'FK_AUCTION_IMAGES_AUCTION_ID',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('auction_images');
  }
}
