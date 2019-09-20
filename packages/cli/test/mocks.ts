import _ from 'lodash'
import wu from 'wu'
import {
  Type, BuiltinTypes, ElemID, Change, ObjectType, Field, InstanceElement, Element,
} from 'adapter-api'
import {
  Plan, PlanItem, SearchResult, Blueprint,
} from 'salto'
import { GroupedNodeMap } from '@salto/dag'
import { YargsCommandBuilder, allBuilders } from '../src/builder'
import realCli from '../src/cli'

export interface MockWriteStreamOpts { isTTY?: boolean; hasColors?: boolean }

export class MockWriteStream {
  constructor({ isTTY = true, hasColors = true }: MockWriteStreamOpts = {}) {
    this.isTTY = isTTY
    this.colors = hasColors
  }

  content = ''
  colors: boolean
  isTTY: boolean

  write(s: string): void { this.content += s }
  getColorDepth(): number { return this.colors ? 8 : 1 }
}

export interface MockCliOutput {
  err: string
  out: string
  exitCode: number
}

export const cli = async ({
  builders = allBuilders,
  args = [],
  out = {},
  err = {},
}: {
  builders?: YargsCommandBuilder[]
  args?: string[] | string
  out?: MockWriteStreamOpts
  err?: MockWriteStreamOpts
} = {}): Promise<MockCliOutput> => {
  const input = {
    args: _.isArray(args) ? args : args.split(' '),
    stdin: {},
  }

  const output = {
    stderr: new MockWriteStream(err),
    stdout: new MockWriteStream(out),
  }

  const exitCode = await realCli(input, output, builders)

  return { err: output.stderr.content, out: output.stdout.content, exitCode }
}

export const elements = (): Element[] => {
  const addrElemID = new ElemID('salto', 'address')
  const saltoAddr = new ObjectType({
    elemID: addrElemID,
    fields: {
      country: new Field(addrElemID, 'country', BuiltinTypes.STRING),
      city: new Field(addrElemID, 'city', BuiltinTypes.STRING),
    },
  })
  saltoAddr.annotationTypes.label = BuiltinTypes.STRING

  const officeElemID = new ElemID('salto', 'office')
  const saltoOffice = new ObjectType({
    elemID: officeElemID,
    fields: {
      name: new Field(officeElemID, 'name', BuiltinTypes.STRING),
      location: new Field(
        officeElemID,
        'location',
        saltoAddr,
        {
          label: 'Office Location',
          description: 'A location of an office',
        },
      ),
    },
    annotations: {
      description: 'Office type in salto',
    },
  })
  saltoOffice.annotationTypes.label = BuiltinTypes.STRING

  const employeeElemID = new ElemID('salto', 'employee')
  const saltoEmployee = new ObjectType({
    elemID: employeeElemID,
    fields: {
      name: new Field(
        employeeElemID,
        'name',
        BuiltinTypes.STRING,
        { _required: true },
      ),
      nicknames: new Field(
        employeeElemID,
        'nicknames',
        BuiltinTypes.STRING,
        {},
        true
      ),
      /* eslint-disable-next-line @typescript-eslint/camelcase */
      employee_resident: new Field(
        employeeElemID,
        'employee_resident',
        saltoAddr,
        { label: 'Employee Resident' }
      ),
      company: new Field(
        employeeElemID,
        'company',
        BuiltinTypes.STRING,
        { _default: 'salto' },
      ),
      office: new Field(
        employeeElemID,
        'office',
        saltoOffice,
        {
          label: 'Based In',
          name: {
            [Type.DEFAULT]: 'HQ',
          },
          location: {
            country: {
              [Type.DEFAULT]: 'IL',
            },
            city: {
              [Type.DEFAULT]: 'Raanana',
            },
          },
        },
      ),
    },
  })

  const saltoEmployeeInstance = new InstanceElement(new ElemID('salto', 'employee_instance'),
    saltoEmployee, { name: 'FirstEmployee' })

  return [BuiltinTypes.STRING, saltoAddr, saltoOffice, saltoEmployee, saltoEmployeeInstance]
}

export const plan = (): Plan => {
  const planItem = (before?: string, after?: string): Change => {
    const adapter = 'salesforce'
    if (before && after) {
      return {
        action: 'modify',
        data: {
          before: new ObjectType({ elemID: new ElemID(adapter, before) }),
          after: new ObjectType({ elemID: new ElemID(adapter, after) }),
        },
      }
    }
    if (before) {
      return {
        action: 'remove',
        data: { before: new ObjectType({ elemID: new ElemID(adapter, before) }) },
      }
    }
    return {
      action: 'add',
      data: {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        after: new ObjectType({ elemID: new ElemID(adapter, after!) }),
      },
    }
  }
  const add = (name: string): Change => planItem(undefined, name)
  const remove = (name: string): Change => planItem(name, undefined)
  const modify = (name: string): Change => planItem(name, name)

  const result = new GroupedNodeMap<Change>()

  const leadPlanItem: PlanItem = {
    items: new Map<string, Change>([
      ['lead', modify('lead')],
      ['lead_do_you_have_a_sales_team', add('lead_do_you_have_a_sales_team')],
      ['lead_how_many_sales_people', modify('lead_do_you_have_a_sales_team')],
      ['lead_status', remove('lead_status')],
    ]),
    groupKey: 'lead',
    parent: () => modify('lead'),
  }
  result.addNode(_.uniqueId('lead'), [], leadPlanItem)

  const accountPlanItem: PlanItem = {
    items: new Map<string, Change>([
      ['account_status', add('account_status')],
      ['account_name', modify('account_name')],
    ]),
    groupKey: 'account',
    parent: () => modify('account'),
  }
  result.addNode(_.uniqueId('account'), [], accountPlanItem)

  const employeeInstance = elements()[4] as InstanceElement
  const updatedEmployee = _.cloneDeep(employeeInstance)
  updatedEmployee.value.name = 'PostChange'
  const employeeChange: Change = {
    action: 'modify',
    data: {
      before: employeeInstance,
      after: updatedEmployee,
    },
  }
  const instancePlanItem: PlanItem = {
    items: new Map<string, Change>([['instance', employeeChange]]),
    groupKey: 'instance',
    parent: () => employeeChange,
  }
  result.addNode(_.uniqueId('instance'), [], instancePlanItem)

  Object.assign(result, {
    itemsByEvalOrder(): Iterable<PlanItem> {
      return [leadPlanItem, accountPlanItem, instancePlanItem]
    },
    getItem(id: string): PlanItem {
      if (id.startsWith('lead')) return leadPlanItem
      return id.startsWith('account') ? accountPlanItem : instancePlanItem
    },
  })

  return result as Plan
}

export const apply = async (
  _blueprints: Blueprint[],
  _fillConfig: (configType: ObjectType) => Promise<InstanceElement>,
  shouldApply: (plan: Plan) => Promise<boolean>,
  reportProgress: (action: PlanItem) => void,
  force = false
): Promise<Plan> => {
  const changes = await plan()
  if (force || await shouldApply(changes)) {
    wu(changes.itemsByEvalOrder()).forEach(change => {
      reportProgress(change)
    })
  }

  return changes
}

export const discover = async (_blueprints: Blueprint[],
  _fillConfig: (configType: ObjectType) => Promise<InstanceElement>): Promise<Blueprint[]> =>
  [({ buffer: Buffer.from('asd'), filename: 'none' })]

export const describe = async (_searchWords: string[], _blueprints?: Blueprint[]):
  Promise<SearchResult> =>
  ({
    key: 'salto_office',
    element: elements()[2],
    isGuess: false,
  })

export const exportToCsv = async (_typeId: string, _blueprints: Blueprint[],
  _fillConfig: (configType: ObjectType) => Promise<InstanceElement>):
  Promise<AsyncIterable<InstanceElement[]>> => (
  async function *mockIterator(): AsyncIterable<InstanceElement[]> {
    const testType = new ObjectType({
      elemID: new ElemID('salesforce', 'test'),
    })
    const elemID = new ElemID('salesforce')
    const values = [
      {
        Id: 1,
        FirstName: 'Daile',
        LastName: 'Limeburn',
        Email: 'dlimeburn0@blogs.com',
        Gender: 'Female',
      }, {
        Id: 2,
        FirstName: 'Murial',
        LastName: 'Morson',
        Email: 'mmorson1@google.nl',
        Gender: 'Female',
      }, {
        Id: 3,
        FirstName: 'Minna',
        LastName: 'Noe',
        Email: 'mnoe2@wikimedia.org',
        Gender: 'Female',
      },
    ]
    yield values.map(value => new InstanceElement(
      elemID,
      testType,
      value
    ))
  }())

export const importFromCsvFile = async (): Promise<void> => {}