import { ILiteSequencerClient } from './ILiteSequencerClient';

export interface ILiteSequencerClientFactory {
    /**
     * Creates Lite Sequencer clients for the provided HTTP endpoints.
     * @param endpoints List of base URLs.
     * @returns Array of ILiteSequencerClient instances, one per endpoint.
     */
    createClients(endpoints: string[]): ILiteSequencerClient[];
}
