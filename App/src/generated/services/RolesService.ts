/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Scaffolded for Dataverse security role lookups. Keep in sync with role.Schema.json.
 */

import type { GetEntityMetadataOptions, EntityMetadata } from '@microsoft/power-apps/data/metadata/dataverse'
import type { IGetOptions, IGetAllOptions } from '../models/CommonModels'
import type { IOperationResult } from '@microsoft/power-apps/data'
import type { Roles } from '../models/RolesModel'
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo'
import { getClient } from '@microsoft/power-apps/data'

export class RolesService {
  private static readonly dataSourceName = 'roles'
  private static readonly client = getClient(dataSourcesInfo)

  public static async get(id: string, options?: IGetOptions): Promise<IOperationResult<Roles>> {
    return RolesService.client.retrieveRecordAsync<Roles>(
      RolesService.dataSourceName,
      id,
      options,
    )
  }

  public static async getAll(options?: IGetAllOptions): Promise<IOperationResult<Roles[]>> {
    return RolesService.client.retrieveMultipleRecordsAsync<Roles>(
      RolesService.dataSourceName,
      options,
    )
  }

  public static getMetadata(
    options: GetEntityMetadataOptions<Roles> = {},
  ): Promise<IOperationResult<Partial<EntityMetadata>>> {
    return RolesService.client.executeAsync({
      dataverseRequest: {
        action: 'getEntityMetadata',
        parameters: {
          tableName: RolesService.dataSourceName,
          options: options as GetEntityMetadataOptions,
        },
      },
    })
  }
}
