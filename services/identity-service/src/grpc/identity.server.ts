import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { identityService } from "../services/identity.service";
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

export function startIdentityGrpcServer() {
  const server = new grpc.Server();

  server.addService(
    protoDescriptor.identity.IdentityService.service,
    identityService
  );

  const address = `${env.grpcHost}:${env.grpcPort}`;

  server.bindAsync(
    address,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error("Failed to start Identity gRPC server:", error);
        process.exit(1);
      }

      console.log(`Identity Service gRPC running on port ${port}`);
    }
  );
}