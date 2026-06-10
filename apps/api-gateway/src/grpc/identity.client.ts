import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
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

export function callIdentityMethod<TRequest, TResponse>(
  methodName: string,
  payload: TRequest
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    identityClient[methodName](
      payload,
      (error: grpc.ServiceError | null, response: TResponse) => {
        if (error) {
          return reject(error);
        }

        return resolve(response);
      }
    );
  });
}