import path from "path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { env } from "../config/env";

const protoPath = path.resolve(__dirname, "../../../../proto/identity.proto");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;

export const identityClient = new protoDescriptor.identity.IdentityService(
  env.identityGrpcUrl,
  grpc.credentials.createInsecure()
);