import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

import * as fs from 'fs';

interface PoxyInstTestStackProps extends cdk.StackProps {
}
export class PoxyInstTestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: PoxyInstTestStackProps) {
    super(scope, id, props);

    //--- begin --- VPC ------------------------------------------------------------
    
    const vpc = new ec2.Vpc(this, 'AwsCdkTplStackVPC', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 27,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 27,
        },
      ],
    });

    //---------------------------------------------------------------------- end ---

    //--- begin --- Proxy Instance -------------------------------------------------

    // Proxy SG
    const proxy_sg = new ec2.SecurityGroup(this, 'ProxySg', {
      allowAllOutbound: true,
      securityGroupName: 'Proxy Sev Security Group',
      vpc: vpc,
    });

    // SSM
    const proxy_iam_role = new iam.Role(this, 'iam_role_for_proxy_ssm', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
      ],
    });
    const iamInstanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      path: '/',
      roles: [proxy_iam_role.roleName]
    });
  
    // Proxy Instance
    const machineImageId = ec2.MachineImage.latestAmazonLinux({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      edition: ec2.AmazonLinuxEdition.STANDARD,
      virtualization: ec2.AmazonLinuxVirt.HVM,
      //cpuType: ec2.AmazonLinuxCpuType.X86_64,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    }).getImage(this).imageId;

    const instance = new ec2.CfnInstance(this, 'ProxyInstance', {
      blockDeviceMappings: [{
        deviceName: '/dev/xvda',
          ebs: {
            deleteOnTermination: true,
            encrypted: true,
            volumeSize: 8,
            volumeType: ec2.EbsDeviceVolumeType.GENERAL_PURPOSE_SSD_GP3, // ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html
            //volumeType: ec2.EbsDeviceVolumeType.STANDARD, // ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html
        }
      }],
      imageId: machineImageId,
      //instanceType: 't3a.nano', // 2 vCPU, 0.5 GB (AMD)
      instanceType: 't4g.nano', // 2 vCPU, 0.5 GB (ARM)
      iamInstanceProfile: iamInstanceProfile.ref,
      securityGroupIds: [proxy_sg.securityGroupId],
      //sourceDestCheck: false, // Required by NAT Instance Operation
      subnetId: vpc.publicSubnets[0].subnetId,
      privateIpAddress: '10.0.0.24', // IP address specification
      userData: cdk.Fn.base64(fs.readFileSync('./lib/user-data-proxy.yaml', 'utf8')),
      tags: [{
        "key": "Name",
        "value": PoxyInstTestStack.name+"/ProxyInstance"
      }]
    });
    const instanceId = instance.ref;

    //---------------------------------------------------------------------- end ---

    //--- begin --- EC2 Instance ---------------------------------------------------

    // SSM
    const ssm_iam_role = new iam.Role(this, 'iam_role_for_ssm', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
      ],
    });
    vpc.addInterfaceEndpoint('InterfaceEndpoint_ssm', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });
    vpc.addInterfaceEndpoint('InterfaceEndpoint_ec2_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });
    vpc.addInterfaceEndpoint('InterfaceEndpoint_ssm_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });

    // EC2 SG
    const ec2_sg = new ec2.SecurityGroup(this, 'Ec2Sg', {
      allowAllOutbound: true,
      securityGroupName: 'EC2 Sev Security Group',
      vpc: vpc,
    });
    proxy_sg.addIngressRule(ec2_sg, ec2.Port.allTraffic(), 'from EC2 SG');

    // EC2 Instance
    const cloud_config = ec2.UserData.forLinux({shebang: ''})
    const user_data_script = fs.readFileSync('./lib/user-data-ec2.yaml', 'utf8');
    cloud_config.addCommands(user_data_script)
    const multipartUserData = new ec2.MultipartUserData();
    multipartUserData.addPart(ec2.MultipartBody.fromUserData(cloud_config, 'text/cloud-config; charset="utf8"'));
    
    const ec2_instance = new ec2.Instance(this, 'General_purpose_ec2', {
      instanceType: new ec2.InstanceType('t3a.nano'), // 2 vCPU, 0.5 GB
//    machineImage: ec2.MachineImage.genericLinux({'us-west-2': 'ami-XXXXXXXXXXXXXXXXX'}),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: ec2.AmazonLinuxEdition.STANDARD,
        virtualization: ec2.AmazonLinuxVirt.HVM,
        storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      }),
      vpc: vpc,
//      blockDevices: [{
//        deviceName: '/dev/xvda',
//        volume: ec2.BlockDeviceVolume.ebs(8),
//      }],
      vpcSubnets: vpc.selectSubnets({subnetGroupName: 'Private',}),
      //vpcSubnets: vpc.selectSubnets({subnetGroupName: 'AwsCdkTplStack/privateSN1',}),
      role: ssm_iam_role,
      userData: multipartUserData,
      securityGroup: ec2_sg,
    });

    //---------------------------------------------------------------------- end ---
  }
}
